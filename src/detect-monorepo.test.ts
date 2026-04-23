import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectMonorepo } from "./detect-monorepo";

describe("detectMonorepo", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "detect-monorepo-"));
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

  it("stops searching after the default max depth (4) levels", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*/functions/src'\n",
    );
    const tooDeep = path.join(tmpRoot, "apps", "firebase", "functions", "src");
    fs.mkdirSync(tooDeep, { recursive: true });

    const result = detectMonorepo(tooDeep);

    expect(result).toBeNull();
  });

  it("finds a marker exactly at the default max depth (3 levels up)", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*/functions'\n",
    );
    const deep = path.join(tmpRoot, "apps", "firebase", "functions");
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

  it("respects a custom finite maxDepth that is smaller than the default", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const twoUp = path.join(tmpRoot, "packages", "api");
    fs.mkdirSync(twoUp, { recursive: true });

    expect(detectMonorepo(twoUp, { maxDepth: 3 })).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
    expect(detectMonorepo(twoUp, { maxDepth: 2 })).toBeNull();
  });

  it("walks to the filesystem root when maxDepth is Infinity", () => {
    fs.writeFileSync(
      path.join(tmpRoot, "pnpm-workspace.yaml"),
      "packages:\n  - 'a/b/c/d/e/f'\n",
    );
    const veryDeep = path.join(tmpRoot, "a", "b", "c", "d", "e", "f");
    fs.mkdirSync(veryDeep, { recursive: true });

    expect(detectMonorepo(veryDeep)).toBeNull();
    expect(detectMonorepo(veryDeep, { maxDepth: Infinity })).toEqual({
      rootDir: tmpRoot,
      kind: "pnpm",
    });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["NaN", Number.NaN],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["string", "4" as unknown as number],
  ])("throws TypeError when maxDepth is %s", (_label, value) => {
    expect(() => detectMonorepo(tmpRoot, { maxDepth: value })).toThrow(
      TypeError,
    );
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
