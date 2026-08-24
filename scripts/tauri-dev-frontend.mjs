#!/usr/bin/env node
/**
 * Tauri `beforeDevCommand`.
 *
 * Do not call `npm run dev` — npm extra-echoes the script and, more
 * importantly, is unnecessary. Spawn this Node process plus
 * `with-app-env.mjs`, which turns `vite` into `node …/vite/bin/vite.js`
 * so Windows never has to exec `vite.cmd` without a shell.
 *
 * Reuses a live Vite server on 127.0.0.1:8080 when one is already up
 * (web preview and desktop app share it).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wipeStaleTarget } from "./tauri-stale-target.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEV_HOST = "127.0.0.1";
const DEV_PORT = 8080;

wipeStaleTarget(root);

function probe() {
  return new Promise((resolve) => {
    const req = http.get(`http://${DEV_HOST}:${DEV_PORT}/`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

if (await probe()) {
  console.log(`Solstice frontend already running on ${DEV_HOST}:${DEV_PORT}`);
  process.exit(0);
}

const child = spawn(
  process.execPath,
  [
    join(root, "scripts", "with-app-env.mjs"),
    "vite",
    "dev",
    "--host",
    "0.0.0.0",
    "--port",
    String(DEV_PORT),
  ],
  {
    stdio: "inherit",
    cwd: root,
    env: process.env,
    shell: false,
    windowsHide: false,
  },
);

function stop() {
  if (child.exitCode != null || child.killed) return;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

for (const signal of process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, stop);
}
process.on("exit", stop);

child.on("error", (err) => {
  console.error("[tauri-dev-frontend] failed to start Vite:", err?.message || err);
  process.exit(127);
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
