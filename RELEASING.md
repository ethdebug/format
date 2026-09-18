# Releasing

This document describes how the `@ethdebug/*` packages in this
repository are versioned and published to npm. The automation lives
in `.github/workflows/publish.yml` and `bin/publish-tagged.ts`; the
guards that run in CI live in `bin/check-tarballs.ts` and
`bin/smoke-tarballs.ts`.

## Versioning model

- Every workspace carries its own version and its own annotated git
  tag of the form `@ethdebug/<name>@<version>`. Lerna runs in
  independent mode (`lerna.json`) so that `lerna changed` reports
  each workspace on its own, but Lerna does not bump versions:
  `bin/version.ts` does (see "Why not `lerna version`" below).
- The version of `@ethdebug/format` is the version of the
  specification itself.
- Prereleases carry a named identifier: `X.Y.Z-draft.<n>` for
  `@ethdebug/format`, because a prerelease of the spec is a draft,
  and `X.Y.Z-preview.<n>` for every other workspace, because those
  packages work but implement a draft. Releases before `0.1.0-draft.0`
  used a plain number (`0.1.0-0` to `0.1.0-2`); they sort before the
  named ones.
- Ten workspaces can take part in a release: the seven public
  packages (`format`, `pointers`, `evm`, `bugc`, `bugc-react`,
  `pointers-react`, `programs-react`) and the three private ones
  (`format-web`, `bug-playground`, `conformance`). Private workspaces
  get versions and tags like the others, but the publish script skips
  them.
- What moves in a release: every workspace whose directory changed
  since its own tag (changes to `CHANGELOG.md` and to test files do
  not count), `@ethdebug/format` when `schemas/` changed (the schemas
  live outside the package directory but ship inside it), and every
  workspace that depends on a moving one, directly or transitively.
  Every workspace depends on `@ethdebug/format`, so a specification
  change moves all ten.
- Series convention, for now: all workspaces start a `major.minor`
  series together and graduate together with the spec; between those
  events each workspace moves only when it or a dependency changed,
  with its own counter. Revisit this when one package needs a long
  preview, or its own keyword, while the others release stable. Until
  then, while any workspace is in a preview, a stable release of
  another workspace graduates that preview too.
- npm dist-tags: a stable version publishes under `latest` (unless a
  higher stable version exists, then `release-<major>.<minor>`); a
  prerelease publishes under `latest` while the package has no stable
  version on the registry, and under its identifier (`draft`,
  `preview`) after that. After a graduation the `draft`/`preview`
  tag stays on the last prerelease until the next series starts.

## Cutting a release

1. Start from a clean checkout of `main` that is up to date with the
   remote, with CI green on the tip commit:

   ```console
   git checkout main && git pull --ff-only
   git status --short   # must print nothing
   ```

2. Preview the current versions of all ten workspaces:

   ```console
   yarn lerna list --all --json
   ```

3. Preview the release and cut the changelogs. The root
   `CHANGELOG.md` tracks the spec version; each public package under
   `packages/*/CHANGELOG.md` tracks that package's own version.

   ```console
   yarn tsx bin/version.ts [keyword] [--all] --dry-run
   ```

   The dry run changes nothing. It lists every workspace that will
   move, with its old and new version and the reason (`changed`,
   `schemas`, `dependent`, `graduates`, or `all`), and it lists each
   changelog that is not cut yet, with the exact `## <version>`
   heading it expects. The keyword is one of:

   | keyword          | use                                           |
   | ---------------- | --------------------------------------------- |
   | `prerelease`     | an ordinary release (the default)             |
   | `patch`          | a stable fix; also graduates every prerelease |
   | `preminor --all` | start the next `0.(Y+1).0` series with drafts |
   | `premajor --all` | start the next major series with drafts       |
   | `minor --all`    | release the next minor series stable at once  |
   | `major --all`    | release the next major series stable at once  |

   `--all` moves every workspace. The series-start keywords require
   it and refuse to run while any workspace is a prerelease. Only
   `preminor` and `premajor` know an exception: they run when every
   workspace is a prerelease of the same `major.minor.patch` (the
   draft and preview identifiers differ by design), which starts the
   next draft series without a stable release in between. `minor` and
   `major` have no exception, because on a prerelease they graduate in
   place; run `patch` first while any prerelease exists.

   For each listed file, rename its `## Unreleased` heading to the
   heading the dry run printed (`## <version> — <YYYY-MM-DD>`, that
   file's own version, then today's date) and leave a fresh, empty
   `## Unreleased` heading above it. A file whose section would be
   empty gets one sentence: `No changes to the specification.` in the
   root file, ``Updated `@ethdebug/<dep>` to `<version>`.`` or
   `No changes.` in a package file, so that every published version
   has a section of its own. The root file is needed only when
   `@ethdebug/format` moves.

   Reconcile the root file's Unreleased entries against the previous
   published version: each `Producers:` and `Consumers:` line states
   the net effect for a party that moves from that version to the new
   one, so an obligation that a later entry in the same section
   reverses appears in neither impact line.

   Commit the cut on its own:

   ```console
   git add CHANGELOG.md packages/*/CHANGELOG.md
   git commit -m "docs: cut changelog entries for release"
   ```

4. Bump. The script checks that you are on `main` with a clean tree,
   that the nearest annotated tag is a release tag, that no tag for a
   new version exists, and that every changelog is cut; then it
   writes the versions and the internal dependency ranges into the
   `package.json` files, commits them as `Publish` with hooks
   disabled, and creates one annotated tag per moving workspace:

   ```console
   yarn tsx bin/version.ts [keyword] [--all]
   ```

   The script never pushes. If it fails after it started writing, it
   prints the undo commands for the stage it reached. The dry run of
   step 3 reports the same guards and findings as this run, but it
   always exits 0, so read its output rather than its exit status.

5. Inspect the result before pushing:

   ```console
   git show --stat HEAD
   git tag --points-at HEAD   # expect one tag per bumped workspace
   ```

6. Push the commit and the tags in one atomic operation:

   ```console
   git push --atomic origin main --follow-tags
   ```

   If the push is rejected because `main` moved, nothing reached the
   remote. Recover with:

   ```console
   git tag -d $(git tag --points-at HEAD)
   git fetch origin
   git reset --hard origin/main
   ```

   Then repeat from step 1. Never `git pull --rebase` over the
   `Publish` commit: the tags stay on the old commit. Before pushing
   again, confirm that no tag for the version exists on the remote:

   ```console
   git ls-remote --tags origin | grep '@<version>$'   # must be empty
   ```

7. Watch the workflow and confirm the result on the registry:

   ```console
   gh run list --workflow publish.yml --limit 3
   gh run watch
   npm view @ethdebug/format versions --json \
     --registry https://registry.npmjs.org
   ```

   The registry can lag by about a minute after a publish.

## What the workflow does

`.github/workflows/publish.yml` runs on every push to `main` and on
manual dispatch. It has two jobs.

- `check` looks for tags of the form `@ethdebug/...` that point at
  `HEAD` and sets a `tagged` output. It needs `contents: read` only.
- `publish` runs when `tagged` is true or when the workflow was
  dispatched by hand. It installs npm 11, installs dependencies with
  the frozen lockfile, runs `yarn test`, then runs
  `yarn tsx bin/publish-tagged.ts`. A dispatched run adds `--dry-run`
  unless the `dry-run` input is set to false. The job holds
  `id-token: write`, which lets npm obtain an OIDC token from GitHub
  and publish through trusted publishing; no npm token is stored in
  the repository. The job runs in the `publish` concurrency group, so
  two releases never publish at the same time.

`bin/publish-tagged.ts` does the following:

1. Reads the tags at `HEAD` and matches them to workspaces. A tag
   whose version differs from the manifest version is an error.
   Private workspaces are skipped.
2. Sorts the selected packages in dependency order, so that
   `@ethdebug/format` publishes before the packages that depend on
   it.
3. For each package, asks the registry for the published versions.
   A version that is already published is skipped, which makes a
   re-run safe. Any registry error other than "package not found"
   aborts the run.
4. Checks the tarball contents (see "Guards" below), then runs
   `npm publish` with `--access public`, the dist-tag chosen by the
   rule in "Versioning model", and
   `--registry https://registry.npmjs.org`, plus `--provenance` when
   running under GitHub Actions. The first failed publish stops the
   run; the summary at the end lists the published, skipped and
   failed packages.

The script strips every `npm_config_*` variable from the environment
before it spawns npm, and passes the registry explicitly. Yarn 1
injects `npm_config_registry=https://registry.yarnpkg.com` into the
environment of every script it runs, and npm would otherwise try to
publish there.

## Trusted publishers on npmjs.com

Each public package has a trusted publisher configured on
npmjs.com under the package's settings: publisher GitHub Actions,
organization `ethdebug`, repository `format`, workflow filename
`publish.yml`, no environment, with "Allow npm publish" checked. A
trusted publisher always allows `npm stage publish`; whether it also
allows a direct `npm publish` depends on that checkbox, and the
workflow needs it (see "Known limits").

A trusted publisher can only be configured on a package that already
exists on the registry, and the publish script aborts on the first
failed publish, in dependency order. A brand-new package without a
trusted publisher therefore fails in CI and blocks every package
sorted after it. Publish a brand-new package by hand BEFORE pushing
the release tags (see "Local fallback" below; tag locally, publish,
then push), configure its trusted publisher, and only then let CI
run.

## Re-running and dispatching

- A failed or cancelled run can be re-run from the Actions UI
  ("Re-run jobs") or with `gh run rerun <run-id>`. Packages that
  already published are skipped.
- To start a run by hand for the tags at the tip of `main`:

  ```console
  gh workflow run publish.yml --ref main -f dry-run=false
  ```

  Without `-f dry-run=false` the dispatched run is a dry run.

- A re-run re-uses the commit that triggered the run, including
  its copy of the workflow and the script. If the publish tooling
  itself needs a fix, merge the fix to `main`, move the release tags
  to the fix commit, then dispatch the workflow:

  ```console
  for tag in $(git tag --points-at <publish-commit>); do
    git tag -f -a "$tag" -m "$tag" <fix-commit>
  done
  git push --force origin $(git tag --points-at <fix-commit>)
  ```

  The tags must stay annotated: `lerna changed` ignores lightweight
  tags.

  The manifests already carry the version, so the tag-to-manifest
  check still passes.

## Local fallback

The same script can publish from a developer machine, for example
for the first publish of a new package:

```console
yarn install --frozen-lockfile
yarn build
yarn tsx bin/publish-tagged.ts
```

Requirements:

- The release tags must point at `HEAD`.
- npm 11 or later, logged in:
  `npm whoami --registry https://registry.npmjs.org` must print your
  user. Name the registry explicitly: a shell spawned by yarn
  carries `npm_config_registry=https://registry.yarnpkg.com`.
- A real interactive terminal. npm prompts for a one-time password
  for every package it publishes, so the script cannot run from a
  non-interactive shell.

Add `--dry-run` to see what would happen without publishing. Outside
GitHub Actions the script does not pass `--provenance`.

## Why not `lerna version`

Lerna 8 cannot produce this scheme. A keyword bump on a numeric
prerelease yields `alpha` (`--preid || existing || "alpha"`); an
explicit version moves every workspace whose prerelease number is
truthy, which is lockstep for `-1` and above and changed-only for
`-0`; and one run takes one `--preid`, so `draft` and `preview` cannot
start a series together. `bin/version.ts` therefore computes each
workspace's next version with `semver` and makes the commit and the
tags itself. Lerna still runs scripts and detects changes.

## Guards

- `bin/check-tarballs.ts` (CI, `run-tests` job) lists the files that
  `npm pack` would put in each public package's tarball and fails if
  any file lies outside `package.json`, `README*`, `LICENSE*`,
  `CHANGELOG*`, `dist/src/` or `dist/bin/`, or if any `.test.` or
  `.tsbuildinfo` file is included. It catches a wrong `files` field,
  test files leaking into the package, and stale build output. The
  publish script runs the same check before every publish. npm ships
  `package.json`, `README*` and `LICENSE*` whatever `files` says, but
  not `CHANGELOG.md`, so every public package lists it in `files`.
- `bin/smoke-tarballs.ts` (CI, `run-tests` job) packs every public
  package, installs each tarball into a throwaway consumer project
  together with the tarballs of its sibling dependencies, imports
  the package's entry point, and for `@ethdebug/bugc` also runs
  `bugc --help`. It catches a broken `main` or `exports`, a missing
  runtime dependency, output that was not built, and a `bin` that
  does not run.
- `yarn vitest run --project bin` tests the pure parts of these
  scripts.

## Known limits

- The `publish` concurrency group protects a job that has started,
  not a run that is still pending. GitHub cancels a pending run in
  the group when a newer one queues, so a `Publish` commit whose run
  shows "cancelled" must be re-run from the Actions UI or
  dispatched by hand.
- CI sets exactly one dist-tag per publish (trusted publishing covers
  `npm publish` only, not `npm dist-tag`). After a graduation the
  `draft` and `preview` tags keep pointing at the last prerelease.
- npm's January 2027 change removes direct publishing with granular
  access tokens that bypass 2FA. It does not affect OIDC trusted
  publishing, and this repository stores no token, so nothing has to
  change by then. What WOULD force a rewrite is switching any
  package's trusted publisher to stage-only (unchecking "Allow npm
  publish"): the registry then rejects `npm publish`, accepts only
  `npm stage publish`, and a human 2FA promote step becomes
  mandatory. Tracked in issue #296.
- Trusted publishing needs npm 11.5 or later. The workflow installs
  npm 11 explicitly because the runner's default npm is older.
