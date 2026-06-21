# CI and releases

CI is split into quality, security, and release workflows so each path stays understandable and independently maintainable.

## Pull requests and main

`.github/workflows/pr-check.yml` runs for pull requests, merge queues, and pushes to `main`. It detects frontend and Rust changes first, then reports a stable `CI success` result. Documentation-only pull requests therefore complete explicitly instead of leaving a required check pending.

- Frontend: ESLint, TypeScript build mode, Vitest, and the production Vite build.
- Rust: `cargo fmt`, Clippy with warnings denied, and the complete Rust test suite.
- Node.js, pnpm, and Rust versions are pinned; installs use `pnpm-lock.yaml` and `Cargo.lock`.
- External Actions are pinned to full commit SHAs and updated by Dependabot.

## Security automation

- `codeql.yml` scans JavaScript/TypeScript and Rust on pull requests, `main`, and a weekly schedule.
- `dependency-review.yml` blocks newly introduced high/critical known vulnerabilities and reports OpenSSF Scorecard data.
- `dependabot.yml` maintains pnpm, Cargo, and GitHub Actions weekly. Minor and patch updates are grouped by ecosystem while major updates remain individually reviewable.

Recommended required checks are `CI success`, `Review dependency changes`, and both language-specific CodeQL jobs.

## Release tags

Every pushed tag triggers `.github/workflows/release.yml`; there are no separate `v*` and numeric tag filters. Release tags are bare semantic versions:

```bash
git tag 0.2.0
git push upstream 0.2.0
```

The workflow verifies that the tag matches the versions in `apps/desktop/package.json`, `tauri.conf.json`, and `Cargo.toml`. A tag such as `0.2.0-beta.1` creates a prerelease draft.

## Verifiable, best-effort reproducible releases

Release builds pin Node.js, pnpm, and Rust, enforce lockfiles, and derive `SOURCE_DATE_EPOCH` from the Git commit timestamp. Every platform adds a `SHA256SUMS-*.txt` manifest to the draft release and publishes GitHub build-provenance attestations.

These controls verify which commit and workflow produced a given file. They do not claim cross-runner byte-for-byte identical installers: runner images, platform packagers, code signing, and notarization can still add nondeterministic metadata.

Official references:

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/use-artifact-attestations)
- [Dependabot options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [CodeQL advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/configuring-advanced-setup-for-code-scanning)
- [Tauri Action](https://github.com/tauri-apps/tauri-action)
- [SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/)
