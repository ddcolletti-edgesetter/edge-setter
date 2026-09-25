/**
 * Event-loop freeze watchdog (worker thread).
 *
 * Why: the [loop-lag] monitor in event-loop-monitor.ts only logs AFTER a block
 * ends — its setInterval callback can't run until the loop is free again. So a
 * block long enough to trip Render's 5s health check gets the instance killed
 * before the monitor ever logs a line, and the real blocker is never recorded.
 * This watchdog reports the freeze WHILE it is happening.
 *
 * How: the main thread stamps Date.now() into a SharedArrayBuffer every
 * HEARTBEAT_MS and bumps a futex word. A worker thread parks in Atomics.wait on
 * that word with a CHECK_MS timeout, so it wakes on every heartbeat and, when
 * the main thread is frozen, on the kernel timeout. On wake it reads the
 * heartbeat: if it has gone stale for >= BLOCK_MS it writes a line immediately.
 *
 * Two deliberate mechanics make this survive a fully CPU-bound main thread:
 *   1. Atomics.wait, not setInterval. A worker whose only job is a libuv timer
 *      must keep running its event loop to fire that timer; a busy-looping main
 *      thread starves it and the timer never fires until the block ends (which
 *      is exactly the case we must report on). A thread parked in a futex is
 *      woken by the kernel timer and only needs a brief slice to service — the
 *      scheduler grants that even against a CPU-bound sibling.
 *   2. Active-job names are read from the SharedArrayBuffer, not postMessage.
 *      A thread blocked in Atomics.wait never returns to its event loop, so
 *      message callbacks would never run; the main thread instead serialises the
 *      active list into the buffer whenever a job starts/ends.
 *
 * Output goes to fd 1 via fs.writeSync (not console.log): worker console output
 * is routed back through the — blocked — main thread and would not appear until
 * recovery. The worker is built from an inline JS string with { eval: true } so
 * it survives the esbuild single-file bundle, is unref()'d so it never keeps the
 * process alive, and swallows every error so it can never throw into main.
 */

import { Worker } from "worker_threads";

const BLOCK_MS = 3000;      // report once the loop has been frozen this long
const HEARTBEAT_MS = 250;   // main thread stamps the shared buffer this often
const CHECK_MS = 500;       // worker's max sleep between heartbeat checks

// Shared-buffer layout (single SharedArrayBuffer):
//   bytes  0..7   Float64  heartbeat timestamp (ms since epoch)
//   bytes  8..11  Int32    futex word — bumped + notified on every heartbeat
//   bytes 12..15  Int32    byte length of the active-jobs JSON that follows
//   bytes 16..    Uint8    UTF-8 JSON: [{ name, startedAt }, ...]
const SAB_SIZE = 8192;
const OFF_SEQ = 8;
const OFF_JOBS_LEN = 12;
const OFF_JOBS = 16;

// Runs INSIDE the worker thread. Kept as a plain string (CommonJS require, no
// template literals) so it bundles unchanged and needs no separate file.
const WORKER_CODE = [
  "const { workerData } = require('worker_threads');",
  "const fs = require('fs');",
  "const sab = workerData.sab;",
  "const fbeat = new Float64Array(sab, 0, 1);",
  "const seq = new Int32Array(sab, " + OFF_SEQ + ", 1);",
  "const jobsLen = new Int32Array(sab, " + OFF_JOBS_LEN + ", 1);",
  "const jobsBytes = new Uint8Array(sab, " + OFF_JOBS + ");",
  "const dec = new TextDecoder();",
  "const BLOCK_MS = workerData.blockMs;",
  "const CHECK_MS = workerData.checkMs;",
  "const MILESTONES = [10000, 30000, 60000];", // extra "still blocked Ns" lines
  "function describeActive(now) {",
  "  try {",
  "    var len = Atomics.load(jobsLen, 0);",
  "    if (len <= 0) return 'none';",
  "    var arr = JSON.parse(dec.decode(jobsBytes.subarray(0, len)));",
  "    if (!arr.length) return 'none';",
  "    var parts = [];",
  "    for (var i = 0; i < arr.length; i++) parts.push(arr[i].name + ' (' + (now - arr[i].startedAt) + 'ms)');",
  "    return parts.join(', ');",
  "  } catch (e) { return 'none'; }",
  "}",
  "function line(s) { try { fs.writeSync(1, s + '\\n'); } catch (e) {} }",
  "var blocking = false;",
  "var blockStart = 0;",
  "var nextMilestone = 0;",
  "while (true) {",
  "  try {",
  "    var last = Atomics.load(seq, 0);",
  "    Atomics.wait(seq, 0, last, CHECK_MS);", // wakes on heartbeat notify or timeout
  "    var now = Date.now();",
  "    var beat = fbeat[0];",
  "    if (beat === 0) continue;", // main hasn't written its first heartbeat yet
  "    var gap = now - beat;",
  "    if (gap >= BLOCK_MS) {",
  "      if (!blocking) {",
  "        blocking = true;",
  "        blockStart = beat;", // last heartbeat ≈ when the freeze began
  "        nextMilestone = 0;",
  "        line('[loop-watchdog] main thread blocked ' + BLOCK_MS + 'ms+ | active: ' + describeActive(now));",
  "      }",
  "      var elapsed = now - blockStart;",
  "      while (nextMilestone < MILESTONES.length && elapsed >= MILESTONES[nextMilestone]) {",
  "        line('[loop-watchdog] still blocked ' + Math.round(MILESTONES[nextMilestone] / 1000) + 's | active: ' + describeActive(now));",
  "        nextMilestone++;",
  "      }",
  "    } else if (blocking) {",
  "      blocking = false;",
  "      line('[loop-watchdog] recovered after ' + Math.round((now - blockStart) / 1000) + 's');",
  "    }",
  "  } catch (e) { /* never die: worst case, loop again after the next wait */ }",
  "}",
].join("\n");

let worker: Worker | null = null;
let fbeat: Float64Array | null = null;
let seqI32: Int32Array | null = null;
let jobsLenI32: Int32Array | null = null;
let jobsBytes: Uint8Array | null = null;
const encoder = new TextEncoder();

// Active jobs/requests as of the last event, mirrored into the shared buffer so
// the parked worker can name what was running when a freeze began.
const activeJobs = new Map<number, { name: string; startedAt: number }>();

function writeActiveJobs(): void {
  if (!jobsLenI32 || !jobsBytes) return;
  try {
    const arr: Array<{ name: string; startedAt: number }> = [];
    activeJobs.forEach((v) => arr.push({ name: v.name, startedAt: v.startedAt }));
    let bytes = encoder.encode(JSON.stringify(arr));
    if (bytes.length > jobsBytes.length) {
      // Pathological (hundreds of concurrent jobs): drop to a safe marker rather
      // than write a truncated, unparseable payload.
      bytes = encoder.encode("[]");
    }
    jobsBytes.set(bytes);
    Atomics.store(jobsLenI32, 0, bytes.length); // release: length last, so a reader that sees it also sees the bytes
  } catch { /* ignore */ }
}

/** Start the watchdog. Idempotent; safe to call even if worker_threads or
 *  SharedArrayBuffer are unavailable — it just logs and no-ops. */
export function startLoopWatchdog(): void {
  if (worker) return;
  try {
    const sab = new SharedArrayBuffer(SAB_SIZE);
    fbeat = new Float64Array(sab, 0, 1);
    seqI32 = new Int32Array(sab, OFF_SEQ, 1);
    jobsLenI32 = new Int32Array(sab, OFF_JOBS_LEN, 1);
    jobsBytes = new Uint8Array(sab, OFF_JOBS);
    fbeat[0] = Date.now();      // seed before the worker starts checking
    Atomics.store(jobsLenI32, 0, 0);

    worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { sab, blockMs: BLOCK_MS, checkMs: CHECK_MS },
    });
    // Never let the watchdog keep the process alive or crash the main thread.
    worker.unref();
    worker.on("error", (err) => {
      console.error("[loop-watchdog] worker error (ignored):", err?.message);
    });

    const timer = setInterval(() => {
      if (!fbeat || !seqI32) return;
      fbeat[0] = Date.now();
      Atomics.add(seqI32, 0, 1);
      Atomics.notify(seqI32, 0); // wake the worker so a healthy loop resets fast
    }, HEARTBEAT_MS);
    timer.unref();

    console.log(
      `[loop-watchdog] started (heartbeat ${HEARTBEAT_MS}ms, reports at >=${BLOCK_MS}ms)`,
    );
  } catch (err: any) {
    console.error("[loop-watchdog] failed to start (ignored):", err?.message);
    worker = null;
    fbeat = null;
    seqI32 = null;
    jobsLenI32 = null;
    jobsBytes = null;
  }
}

/** Report a job/request start or finish so the worker's freeze lines can name
 *  what was running. Called from trackJob / trackRequest. Never throws. */
export function watchdogJobEvent(type: "start" | "end", id: number, name: string): void {
  if (!worker) return;
  try {
    if (type === "start") activeJobs.set(id, { name, startedAt: Date.now() });
    else activeJobs.delete(id);
    writeActiveJobs();
  } catch { /* ignore */ }
}
