import fs from "node:fs";
import path from "node:path";

export type MonorepoInfo = {
  /** Absolute path to the monorepo workspace root. */
  rootDir: string;
  /** Which workspace marker was found. "workspaces" covers npm/yarn/bun. */
  kind: "pnpm" | "workspaces" | "rush";
};

export type DetectMonorepoOptions = {
  /**
   * Maximum number of directory levels to walk upward (the start directory
   * plus `maxDepth - 1` parents). Pass `Infinity` to walk all the way to the
   * filesystem root. Must be a positive integer or `Infinity`. Defaults to 4.
   */
  maxDepth?: number;
};

const DEFAULT_MAX_DEPTH = 4;

/**
 * Walk upward from `startDir` looking for a monorepo workspace root. Returns
 * null if none is found within `options.maxDepth` levels (startDir itself plus
 * `maxDepth - 1` parents) or before reaching the filesystem root.
 *
 * Supported markers:
 * - `pnpm-workspace.yaml`
 * - `package.json` containing a `workspaces` field (npm, yarn, bun)
 * - `rush.json`
 *
 * @param startDir Directory to start walking from. Defaults to `process.cwd()`.
 * @param options.maxDepth Maximum number of levels to walk (default `4`). Pass
 *   `Infinity` to walk all the way to the filesystem root. Must be a positive
 *   integer or `Infinity`; invalid values throw a `TypeError`.
 */
export function detectMonorepo(
  startDir: string = process.cwd(),
  options: DetectMonorepoOptions = {},
): MonorepoInfo | null {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (
    typeof maxDepth !== "number" ||
    Number.isNaN(maxDepth) ||
    maxDepth <= 0 ||
    (Number.isFinite(maxDepth) && !Number.isInteger(maxDepth))
  ) {
    throw new TypeError(
      `detectMonorepo: maxDepth must be a positive integer or Infinity, received ${String(maxDepth)}`,
    );
  }
  let current = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i++) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return { rootDir: current, kind: "pnpm" };
    }
    if (fs.existsSync(path.join(current, "rush.json"))) {
      return { rootDir: current, kind: "rush" };
    }
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          workspaces?: unknown;
        };
        if (hasWorkspacesField(pkg.workspaces)) {
          return { rootDir: current, kind: "workspaces" };
        }
      } catch {
        /** Malformed or unreadable package.json — ignore and continue upward. */
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/**
 * Accepts either an array of globs or a Yarn-style object with a `packages`
 * array. Anything else is treated as not a workspace root.
 */
function hasWorkspacesField(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (typeof value === "object" && value !== null) {
    const packages = (value as { packages?: unknown }).packages;
    return Array.isArray(packages);
  }
  return false;
}
