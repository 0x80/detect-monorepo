# CLAUDE.md

Project notes for Claude Code (and other AI agents) working in this repo.

## Releasing

Do **not** bump the `version` field in `package.json` as part of a feature
or fix PR. Releases are handled by a publish GitHub Action that takes care
of versioning, tagging, and publishing to npm. PRs should leave
`package.json` versions untouched.
