import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectMonorepo } from "./detect-monorepo";

describe("detectMonorepo", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "detect-monorepo-"));
    /**
     * Seed a `.git` boundary at the temp root so the walk can't escape the
     * fixture into the host filesystem during tests that expect null.
     */
    fs.mkdirSync(path.join(tmpRoot, ".git"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("detects a pnpm workspace via pnpm-workspace.yaml", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0" }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("detects a workspaces array in package.json (npm/yarn/bun)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: ["packages/*"],
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "workspaces",
    });
  });

  it("detects a workspaces object form in package.json (yarn nohoist)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: { packages: ["packages/*"], nohoist: [] },
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "workspaces",
    });
  });

  it("detects a rush workspace via rush.json", () => {
    fs.writeFileSync(path.join(tmpRoot, "rush.json"), "{}");

    const result = detectMonorepo(tmpRoot);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "rush",
    });
  });

  it("returns null for a standalone package with no workspace markers", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "standalone", version: "1.0.0" }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toBeNull();
  });

  it("finds a marker two levels up from the start directory", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const nested = path.join(tmpRoot, "packages", "api");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "package.json"),
      JSON.stringify({ name: "api", version: "1.0.0" }),
    );

    const result = detectMonorepo(nested);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("stops at a .git repo boundary", () => {
    /**
     * Workspace marker sits *above* an inner directory that has its own
     * `.git`. The walk starts deep inside the inner repo and must stop at
     * the inner `.git` before reaching the outer workspace marker.
     */
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'inner/*'\n",
    );
    const inner = path.join(tmpRoot, "inner");
    fs.mkdirSync(path.join(inner, ".git"), { recursive: true });
    const nested = path.join(inner, "a", "b");
    fs.mkdirSync(nested, { recursive: true });

    const result = detectMonorepo(nested);

    expect(result).toBeNull();
  });

  it("stops at a .hg repo boundary", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'inner/*'\n",
    );
    const inner = path.join(tmpRoot, "inner");
    fs.mkdirSync(path.join(inner, ".hg"), { recursive: true });
    const nested = path.join(inner, "a", "b");
    fs.mkdirSync(nested, { recursive: true });

    const result = detectMonorepo(nested);

    expect(result).toBeNull();
  });

  it("stops at a .svn repo boundary", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'inner/*'\n",
    );
    const inner = path.join(tmpRoot, "inner");
    fs.mkdirSync(path.join(inner, ".svn"), { recursive: true });
    const nested = path.join(inner, "a", "b");
    fs.mkdirSync(nested, { recursive: true });

    const result = detectMonorepo(nested);

    expect(result).toBeNull();
  });

  it("finds a marker at the VCS repo root", () => {
    /**
     * The VCS-bearing directory itself is checked for workspace markers
     * before traversal stops, so a workspace root and a repo root may
     * coincide. (The seeded `.git` at tmpRoot from beforeEach plays the
     * role of the VCS root here.)
     */
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n",
    );
    const deep = path.join(tmpRoot, "apps", "firebase", "functions", "src");
    fs.mkdirSync(deep, { recursive: true });

    const result = detectMonorepo(deep);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("walks more than four levels inside a single VCS repo", () => {
    /**
     * Confirms the old depth cap is gone: a workspace marker six levels
     * above startDir (within the same VCS repo) is still found.
     */
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'a/*'\n",
    );
    const deep = path.join(tmpRoot, "a", "b", "c", "d", "e", "f");
    fs.mkdirSync(deep, { recursive: true });

    const result = detectMonorepo(deep);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("ignores a malformed package.json and continues upward", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const nested = path.join(tmpRoot, "packages", "api");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "package.json"), "{ not valid json");

    const result = detectMonorepo(nested);

    expect(result).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it("ignores an unexpected workspaces shape", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: "packages/*",
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toBeNull();
  });

  it("ignores a workspaces object without a packages array", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({
        name: "root",
        version: "1.0.0",
        workspaces: { nohoist: [] },
      }),
    );

    const result = detectMonorepo(tmpRoot);

    expect(result).toBeNull();
  });

  it("does not match a package.json without a workspaces field", () => {
    const nested = path.join(tmpRoot, "subdir");
    fs.mkdirSync(nested);
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(nested, "package.json"),
      JSON.stringify({ name: "child", version: "1.0.0" }),
    );

    const result = detectMonorepo(nested);

    expect(result).toBeNull();
  });
});
