// Plain ESM build script — no tsx/TypeScript required.
// Equivalent to script/build.ts but runnable with: node script/build.mjs
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  const serverBundle = {
    platform: "node",
    bundle: true,
    format: "cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  };

  await esbuild({
    ...serverBundle,
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.cjs",
  });

  // The situations build runs in a worker_threads Worker, which needs its own
  // entry file — a Worker loads a path, not a function. CJS and .cjs on purpose:
  // Node picks the module system from the extension, and the server bundle is
  // already CJS. situations-cache.ts looks for exactly this path and falls back
  // to building in-thread when it is missing, so a stale dist/ degrades rather
  // than crashing.
  console.log("building situations worker...");
  await esbuild({
    ...serverBundle,
    entryPoints: ["server/pipeline/situations-worker.ts"],
    outfile: "dist/situations-worker.cjs",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
