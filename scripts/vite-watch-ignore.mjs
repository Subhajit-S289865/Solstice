/**
 * Vite / chokidar ignore list for Solstice.
 *
 * `npm run tauri:dev` starts Vite at the project root while Cargo writes
 * `src-tauri/target/**`. On Windows, `fs.watch` on a locked `.o` file throws
 * `EBUSY: resource busy or locked, watch`.
 *
 * Vite 8 always sets `disableGlobbing: true` on its watcher, then joins string
 * globs onto `root`. A function + regex both survive that. Globs stay as a
 * third layer for picomatch-based ignore checks.
 *
 * Frontend HMR for `src/**`, `public/**`, and routes is unchanged.
 */
import { resolve } from "node:path";

export const VITE_WATCH_IGNORE_GLOBS = [
  "**/src-tauri/**",
  "**/src-tauri/target/**",
  "**/src-tauri/target",
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-tauri/**",
  "**/.git/**",
  "**/.output/**",
  "**/.nitro/**",
  "**/.vercel/**",
  "**/.tanstack/**",
  "**/artifacts/**",
  "**/*.o",
  "**/*.obj",
  "**/*.pdb",
  "**/*.rlib",
  "**/*.rmeta",
];

/** Path tests that do not depend on globbing or cwd-joining. */
export const VITE_WATCH_IGNORE_REGEXPS = [
  /(?:^|[/\\])src-tauri(?:[/\\]|$)/i,
  /(?:^|[/\\])node_modules(?:[/\\]|$)/i,
  /(?:^|[/\\])dist-tauri(?:[/\\]|$)/i,
  /(?:^|[/\\])(?:\.git|\.output|\.nitro|\.vercel|\.tanstack|artifacts)(?:[/\\]|$)/i,
  /(?:^|[/\\])dist(?:[/\\]|$)/i,
  /(?:^|[/\\])target(?:[/\\]|$)/i,
  /\.(?:o|obj|pdb|rlib|rmeta|dll|so|dylib)$/i,
];

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "dist-tauri",
  "src-tauri",
  ".git",
  ".output",
  ".nitro",
  ".vercel",
  ".tanstack",
  ".wrangler",
  "artifacts",
  "target",
]);

const COMPILED_EXT = /\.(?:o|obj|pdb|rlib|rmeta|dll|so|dylib)$/i;

function pathSegments(filePath) {
  const n = String(filePath ?? "").replace(/\\/g, "/");
  const segs = n.split("/").filter((s) => s && s !== ".");
  if (segs[0] && /^[a-zA-Z]:$/.test(segs[0])) segs.shift();
  return segs;
}

/**
 * @param {string} filePath absolute or relative path (Windows or POSIX)
 * @returns {boolean} true when Vite must not watch this path
 */
export function isViteWatchIgnored(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  const segs = pathSegments(filePath);
  if (segs.length === 0) return false;

  for (let i = 0; i < segs.length; i++) {
    if (IGNORED_DIR_NAMES.has(segs[i])) return true;
  }

  const last = segs[segs.length - 1] ?? "";
  if (COMPILED_EXT.test(last)) return true;
  return false;
}

export function viteWatchOptions() {
  return {
    ignored: [
      isViteWatchIgnored,
      ...VITE_WATCH_IGNORE_REGEXPS,
      ...VITE_WATCH_IGNORE_GLOBS,
    ],
    ignorePermissionErrors: true,
  };
}

function generatedDirs(root) {
  return [
    resolve(root, "src-tauri"),
    resolve(root, "src-tauri/target"),
    resolve(root, "dist"),
    resolve(root, "dist-tauri"),
    resolve(root, "node_modules"),
    resolve(root, "artifacts"),
  ];
}

/** Drop generated dirs if chokidar still lists them after the initial scan. */
export function viteWatchIgnorePlugin() {
  return {
    name: "solstice:watch-ignore-generated",
    apply: "serve",
    configureServer(server) {
      const watcher = server.watcher;
      if (!watcher || typeof watcher.unwatch !== "function") return;
      const abs = generatedDirs(server.config.root);
      const drop = () => {
        try {
          watcher.unwatch(abs);
        } catch {
          /* watcher already closed */
        }
      };
      drop();
      watcher.on("ready", drop);
      const dropIfGenerated = (filePath) => {
        if (isViteWatchIgnored(filePath)) {
          try {
            watcher.unwatch(filePath);
          } catch {
            /* ignore */
          }
        }
      };
      watcher.on("addDir", dropIfGenerated);
      watcher.on("add", dropIfGenerated);
    },
  };
}
