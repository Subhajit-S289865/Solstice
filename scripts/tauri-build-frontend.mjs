#!/usr/bin/env node
/**
 * Tauri `beforeBuildCommand`.
 * Runs the SPA Vite build then flattens index.html — no `npm run`, no shell
 * `&&`, so Windows cmd / PowerShell / Git Bash all take the same path.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wipeStaleTarget } from "./tauri-stale-target.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
wipeStaleTarget(root);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      cwd: root,
      env: process.env,
      shell: false,
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`killed ${signal}`));
      else if (code) reject(new Error(`exit ${code}`));
      else resolve();
    });
  });
}

try {
  await run([
    join(root, "scripts", "with-app-env.mjs"),
    "vite",
    "build",
    "--config",
    "vite.tauri.config.ts",
  ]);
  await run([join(root, "scripts", "tauri-pack-frontend.mjs")]);
} catch (err) {
  console.error("[tauri-build-frontend]", err?.message || err);
  process.exit(1);
}
