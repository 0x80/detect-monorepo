# detect-monorepo

A tiny, zero-dependency helper that walks upward from a starting directory to
decide whether it sits inside a JS/TS monorepo workspace.

It recognises:

- pnpm workspaces (`pnpm-workspace.yaml`)
- npm, yarn, and bun workspaces (`workspaces` field in `package.json`)
- Rush (`rush.json`)

It is intended for tools that need a cheap pre-check before loading heavier
monorepo tooling — for example,
[`isolate-package`](https://github.com/0x80/isolate-package) is only useful
inside a monorepo, so consumers like
[`firebase-tools-with-isolate`](https://github.com/0x80/firebase-tools-with-isolate)
can call `detectMonorepo` first and only pay the cost of loading
`isolate-package` when a workspace is actually detected.

## Install

```sh
pnpm add detect-monorepo
# or
npm install detect-monorepo
```

## Usage

```ts
import { detectMonorepo } from "detect-monorepo";

const info = detectMonorepo();
// or pass an explicit start directory:
const info = detectMonorepo("/path/to/some/package");
// or raise/remove the upward-walk limit:
const info = detectMonorepo("/path/to/some/package", { maxDepth: 8 });
const info = detectMonorepo("/path/to/some/package", { maxDepth: Infinity });

if (info) {
  console.log(`Monorepo detected at ${info.rootDir} (kind: ${info.kind})`);
} else {
  console.log("Not inside a monorepo");
}
```

The function returns either `null` or:

```ts
type MonorepoInfo = {
  /** Absolute path to the monorepo workspace root. */
  rootDir: string;
  /** Which workspace marker was found. "workspaces" covers npm/yarn/bun. */
  kind: "pnpm" | "workspaces" | "rush";
};
```

## Options

```ts
type DetectMonorepoOptions = {
  /**
   * Maximum number of directory levels to walk upward (the start directory
   * plus `maxDepth - 1` parents). Pass `Infinity` to walk all the way to the
   * filesystem root. Must be a positive integer or `Infinity`. Defaults to 4.
   */
  maxDepth?: number;
};
```

Invalid `maxDepth` values (zero, negative, non-integer, `NaN`, non-number)
throw a `TypeError`.

## Behaviour

- Walks upward from `startDir` (default: `process.cwd()`) up to `maxDepth`
  levels (default `4` — the start directory plus three parents), stopping at
  the filesystem root if reached earlier. Pass `{ maxDepth: Infinity }` to
  walk until the filesystem root is reached.
- Returns the first match found while walking upward.
- A `package.json` that cannot be parsed, or one whose `workspaces` field
  isn't an array or a `{ packages: string[] }` object, is treated as "no
  workspace marker here" — the walk continues upward.
- Requires Node.js 20 or newer.

## License

MIT © Thijs Koerselman
