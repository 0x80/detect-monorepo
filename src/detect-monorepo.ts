import fs from "node:fs";
import path from "node:path";

export type MonorepoInfo = {
  /** Absolute path to the monorepo workspace root. */
  rootDir: string;
  /** Which workspace marker was found. "workspaces" covers npm/yarn/bun. */
  kind: "pnpm" | "workspaces" | "rush";
};

/**
 * Markers that indicate a version-control working-copy root. We never walk
 * above one of these — workspace markers above the VCS boundary are not
 * legitimately part of the project.
 */
const VCS_MARKERS = [".git", ".hg", ".svn"];

/**
 * Walk upward from `startDir` looking for a monorepo workspace root. Returns
 * null if no marker is found before a VCS-root boundary (`.git`, `.hg`, or
 * `.svn`) or the filesystem root is reached. The VCS-bearing directory is
 * itself checked for workspace markers before traversal stops, so a
 * workspace root and a repo root may coincide.
 *
 * Supported markers:
 * - `pnpm-workspace.yaml`
 * - `package.json` containing a `workspaces` field (npm, yarn, bun)
 * - `rush.json`
 */
export function detectMonorepo(
  startDir: string = process.cwd(),
): MonorepoInfo | null {
  let current = path.resolve(startDir);
  while (true) {
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
    if (VCS_MARKERS.some((m) => fs.existsSync(path.join(current, m)))) {
      return null;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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
