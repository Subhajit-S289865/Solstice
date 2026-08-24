#!/usr/bin/env node
/**
 * Run a command with `.grok/app-env.json` merged into its environment.
 *
 * `dev`, `build` and `preview` all route through this wrapper, so the dev
 * server, the built bundle and the preview server can never disagree about
 * `VITE_AUTH_ENABLED` — a divergence that only shows up as a built-output
 * mismatch long after the fact. Anything that starts Vite directly bypasses it.
 *
 * Only `VITE_`-prefixed keys are honored: the file is a build flag carrier, not
 * a secret store, and only `VITE_` vars reach the browser anyway. A real
 * `process.env` entry always wins, so an explicit override still works.
 *
 * That precedence also means the file governs this workspace only. A deployed
 * build runs with the provider's project env, where the deployer sets
 * `VITE_AUTH_ENABLED` itself (today unconditionally `"true"`), so the deployed
 * flag is the platform's, not this file's.
 *
 * Vite picks the values up because `loadEnv` prefix-matches entries already in
 * `process.env`, which is why the merge has to happen before Vite starts.
 *
 * Local CLIs (`vite`, `tauri`, …) are resolved to their JS entry files and
 * launched with this Node process. Windows cannot `spawn("vite")` — the file
 * in `node_modules/.bin` is `vite.cmd`, which requires a shell. Never spawn a
 * bare binary name without going through `resolveSpawn`.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ENV_REL_PATH = ".grok/app-env.json";

const VITE_PREFIX = "VITE_";
const require = createRequire(import.meta.url);

/**
 * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
 * Anything unparseable is an empty environment — a workspace without the file
 * must behave exactly like today (auth on, no overrides).
 */
export function parseAppEnv(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const env = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(VITE_PREFIX)) continue;
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}

/** The app env recorded under `root`, or `{}` when the file is absent. */
export function readAppEnv(root) {
  try {
    return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
  } catch {
    return {};
  }
}

/** File values under the process environment: an explicit override wins. */
export function mergeAppEnv(appEnv, processEnv) {
  return { ...appEnv, ...processEnv };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

/** Resolve `pkg`'s `bin[name]` to an on-disk JS file. */
export function packageCli(pkg, binName) {
  try {
    const pkgJsonPath = require.resolve(`${pkg}/package.json`);
    const dir = dirname(pkgJsonPath);
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    let bin = pkgJson.bin;
    if (bin && typeof bin === "object") {
      bin = bin[binName] ?? Object.values(bin)[0];
    }
    if (typeof bin !== "string") return null;
    const p = join(dir, bin);
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const JS_CLIS = {
  vite: () => packageCli("vite", "vite"),
  tauri: () => packageCli("@tauri-apps/cli", "tauri"),
};

function quoteForCmd(p) {
  return /\s/.test(p) ? `"${p}"` : p;
}

/**
 * Turn a bare CLI name (`vite`) into something `spawn` can exec on Windows
 * and Unix without a shell.
 *
 * Order:
 * 1. node / absolute / *.js  → as-is
 * 2. known JS CLIs           → `process.execPath` + package bin
 * 3. `node_modules/.bin`     → `.cmd`/`.exe` on Windows (shell only for `.cmd`)
 * 4. last resort             → shell on Windows so PATHEXT applies
 */
export function resolveSpawn(command, args, root = projectRoot()) {
  const isWin = process.platform === "win32";
  if (
    command === process.execPath ||
    command === "node" ||
    isAbsolute(command) ||
    /\.(cjs|mjs|js)$/i.test(command)
  ) {
    return { command, args, shell: false };
  }

  const js = JS_CLIS[command]?.();
  if (js) {
    return { command: process.execPath, args: [js, ...args], shell: false };
  }

  const binDir = join(root, "node_modules", ".bin");
  if (isWin) {
    for (const name of [`${command}.cmd`, `${command}.exe`, `${command}.bat`, command]) {
      const p = join(binDir, name);
      if (existsSync(p)) {
        const needShell = /\.(cmd|bat)$/i.test(p);
        return { command: needShell ? quoteForCmd(p) : p, args, shell: needShell };
      }
    }
    return { command, args, shell: true };
  }

  const unix = join(binDir, command);
  if (existsSync(unix)) {
    return { command: unix, args, shell: false };
  }
  return { command, args, shell: false };
}

export function withLocalBinPath(env, root) {
  const bin = join(root, "node_modules", ".bin");
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const current = env[key] ?? "";
  const parts = current.split(delimiter);
  if (parts.includes(bin)) return env;
  return { ...env, [key]: `${bin}${delimiter}${current}` };
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const root = projectRoot();
  const env = withLocalBinPath(mergeAppEnv(readAppEnv(root), process.env), root);
  const resolved = resolveSpawn(command, args, root);
  const child = spawn(resolved.command, resolved.args, {
    stdio: "inherit",
    env,
    cwd: root,
    shell: resolved.shell,
    windowsHide: false,
  });
  const signals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of signals) {
    process.on(signal, () => {
      try {
        child.kill(signal);
      } catch {
        child.kill();
      }
    });
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
