# Releasing

This document describes how the `@ethdebug/*` packages in this
repository are versioned and published to npm. The automation lives
in `.github/workflows/publish.yml` and `bin/publish-tagged.ts`; the
guards that run in CI live in `bin/check-tarballs.ts` and
`bin/smoke-tarballs.ts`.

## Versioning model

- Lerna runs in independent mode (`lerna.json`), so every workspace
  carries its own version and its own git tag of the form
  `@ethdebug/<name>@<version>`.
- The version of `@ethdebug/format` is the version of the
  specification itself.
- Prereleases use a plain numeric suffix: `0.1.0-0`, `0.1.0-1`, and
  so on. Write them as `0.1.0-<n>`.
- Ten workspaces can take part in a release: the seven public
  packages (`format`, `pointers`, `evm`, `bugc`, `bugc-react`,
  `pointers-react`, `programs-react`) and the three private ones
  (`format-web`, `bug-playground`, `conformance`). Private packages
  get versions and tags like the others, but the publish script
  skips them.
- Lerna bumps only the packages that changed since their last tag,
  plus the packages that depend on them, and it tags only those. The
  first release (`0.1.0-1`) moved all ten because no package had a
  tag yet. To move all ten in lockstep on a later release, add
  `--force-publish` to the `lerna version` command below.

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

3. Update the changelogs before bumping. The root `CHANGELOG.md`
   tracks the spec version; each public package under
   `packages/*/CHANGELOG.md` tracks that package's own version.

   See which packages the next step will move:

   ```console
   yarn lerna changed
   ```

   The bump in step 4 moves every package that command lists, plus
   every package that depends on one of them.

   For the root file, and for each package about to be bumped,
   rename its `## Unreleased` heading to
   `## <version> — <YYYY-MM-DD>`: that package's own new version,
   then today's date. Leave a fresh, empty `## Unreleased` heading
   above the section you renamed. A package that is not being bumped
   needs no change.

   When you rename `## Unreleased` in the root file, reconcile its
   entries against the previous published version. Each `Producers:`
   and `Consumers:` line states the net effect for a party that
   moves from that version to the new one. If one Unreleased entry
   reverses an obligation of another Unreleased entry, neither
   impact line keeps that obligation; the summaries may still tell
   the history.

   A package that is bumped only because a dependency of it changed
   has nothing under `## Unreleased`. Give it a `### Changed` entry
   reading "Updated `@ethdebug/<dep>` to `<version>`.", so that every
   published version has a section of its own.

   Commit the renamed files on their own, right before the version
   bump in the next step:

   ```console
   git add CHANGELOG.md packages/*/CHANGELOG.md
   git commit -m "docs: cut changelog entries for <version>"
   ```

   Pre-flight check: in each file you touched, the only remaining
   `## Unreleased` section is the empty one at the top. Never publish
   with entries still sitting under `## Unreleased` in a changelog
   for a package (or the spec) being released.

4. Bump to an explicit version. Lerna commits the result as
   `Publish` and creates one tag per bumped workspace on that
   commit:

   ```console
   yarn lerna version 0.1.0-<n> --no-push --no-commit-hooks --yes
   ```

   Each flag matters:
   - The version MUST be explicit. `yarn lerna version prerelease`
     does not produce `0.1.0-1` from `0.1.0-0`: Lerna resolves the
     prerelease identifier as `--preid || existing preid || "alpha"`,
     and a numeric prerelease has no identifier, so the result is
     `0.1.0-alpha.0`.
   - `--no-commit-hooks`: the repository's pre-commit hook runs
     lint-staged, which would rewrite files in the `Publish` commit.
   - `--no-push`: Lerna would otherwise run
     `git push --follow-tags --no-verify --atomic <remote> <branch>`
     and, when the error text mentions "atomic", silently retry
     WITHOUT `--atomic`. The push happens by hand in step 6 instead:
     no non-atomic fallback, no `--no-verify` skipping the pre-push
     hooks, and step 5's inspection happens before anything reaches
     the remote.
   - `--yes`: skips the confirmation prompt. Preview with the command
     in step 2 first; do not use `--no-git-tag-version` as a
     preview, because it still rewrites every `package.json`.

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
   git ls-remote --tags origin | grep '0.1.0-<n>'   # must be empty
   ```

   If Lerna's own push did run (`--no-push` was forgotten), its
   non-atomic retry may have left the remote with tags but no commit,
   or the reverse. See what landed with `git ls-remote --tags origin`
   and `git ls-remote origin main`, then either finish the push with
   the command above or delete each stray remote tag:

   ```console
   git push origin :refs/tags/<tag>
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
   `npm publish` with `--access public`, `--tag latest` and
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
    git tag -f "$tag" <fix-commit>
  done
  git push --force origin $(git tag --points-at <fix-commit>)
  ```

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
- Prereleases are published under the `latest` dist-tag, so a plain
  `npm install @ethdebug/format` installs a prerelease. At the first
  stable release, either publish prereleases under `next` or move
  `latest` with `npm dist-tag` afterwards.
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
