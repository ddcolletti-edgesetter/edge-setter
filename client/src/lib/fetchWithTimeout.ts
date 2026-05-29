export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ?? controller.signal;

  return fetch(input, { ...init, signal }).finally(() => globalThis.clearTimeout(timeout));
}
