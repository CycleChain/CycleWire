# Releasing (maintainers)

CycleWire uses [Semantic Versioning](https://semver.org), annotated git tags (`vX.Y.Z`),
GitHub Releases and npm with trusted publishing. Once trusted publishing works, nothing
is published from a laptop.

## Every release

1. Make sure `main` is green in CI.
2. Update `version` in `package.json` (`npm version <patch|minor|major> --no-git-tag-version`).
3. Move the "Unreleased" notes in `CHANGELOG.md` under the new version and date, and
   update the compare links at the bottom.
4. Refresh the README's size table with `npm run build && npm run size -- --readme`, and
   check the sizes written in the prose (README, `docs/performance.md`, `docs/modules.md`,
   `docs/concepts.md`); the landing page takes its sizes from `dist/sizes.json` by itself.
5. Commit: `git commit -am "chore(release): X.Y.Z"`.
6. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "CycleWire vX.Y.Z"
   git push origin main --follow-tags
   ```

The tag starts `.github/workflows/release.yml`, which:

1. installs, type-checks, runs the unit and browser tests, builds and checks the size
   budgets;
2. checks that the tag matches `package.json`;
3. publishes to npm through OIDC trusted publishing, which attaches provenance, unless
   that version is already on npm;
4. creates the GitHub Release. The notes come from `CHANGELOG.md`, and the `dist/` bundles
   and their SRI hashes are attached.

The site (the landing page, the documentation and the live examples) redeploys on every
push to `main` (`.github/workflows/pages.yml`), the release commit included.

## Publishing by hand

Until trusted publishing works, a maintainer publishes the release commit from a clean
checkout, then pushes the tag:

```bash
git switch main && git pull
npm ci
npx playwright install chromium firefox webkit
npm publish --access public     # prepublishOnly builds and tests first; npm asks for the second factor
git tag -a vX.Y.Z -m "CycleWire vX.Y.Z"
git push origin vX.Y.Z
```

The Release workflow still verifies the commit, finds the version already on npm, skips
publishing, and creates the GitHub Release with the notes and SRI hashes.

## Pre-releases

Use a pre-release version (`1.1.0-beta.1`) and tag. The workflow publishes it under the
`next` dist-tag and marks the GitHub Release as a pre-release.

## One-time setup

These steps need the owner's npm and GitHub accounts.

1. **First publish.** npm can only attach a trusted publisher to a package that already
   exists, so 1.0.0 is published by hand from a clean checkout of the release commit:

   ```bash
   npm login
   npm publish --access public
   ```

   `prepublishOnly` builds and tests first.

2. **Trusted publisher.** On npmjs.com, open `cyclewire`, then Settings, then Trusted
   Publisher, then GitHub Actions. Enter organization `CycleChain`, repository
   `CycleWire` and workflow `release.yml`. To check it without releasing anything, run
   the Release workflow by hand (Actions, then Release, then Run workflow): it asks npm
   for a publish token the way `npm publish` does and prints npm's answer. Once that
   passes, you can disallow tokens altogether in the package's publishing access settings.

3. **GitHub Pages.** In the repository settings, set Pages to be deployed by "GitHub
   Actions". The `github-pages` environment then accepts deployments from `main`, which
   is where the Pages workflow deploys from.

4. **The site on cyclechain.io.** The Pages workflow publishes the site on GitHub Pages
   until the repository variable `SITE_DEPLOY` is `server`. From then on it builds the
   site for `https://cyclechain.io/labs/cyclewire/`, copies it into the server's
   `labs/cyclewire/` folder with rsync over SSH, and only after that turns GitHub Pages
   into a page that sends every old address to the same page on cyclechain.io. To set it
   up:

   1. On the server, give the copy a user of its own that can write to that folder and
      nowhere else, and make the folder:

      ```bash
      sudo adduser --disabled-password --gecos '' cyclewire-site
      sudo mkdir -p <web root>/labs/cyclewire
      sudo chown cyclewire-site: <web root>/labs/cyclewire
      ```

   2. On your machine, make a key for the workflow, with no passphrase:

      ```bash
      ssh-keygen -t ed25519 -N '' -C cyclewire-site -f cyclewire-site
      ```

      Put `cyclewire-site.pub` in the server's
      `/home/cyclewire-site/.ssh/authorized_keys`, preceded by `restrict ` so the key
      can copy files but not open a shell with forwarding.

   3. In the repository settings, under Secrets and variables, then Actions, add these
      secrets:

      | Secret | Value |
      | --- | --- |
      | `SITE_DEPLOY_HOST` | The server's own address, not the cyclechain.io name Cloudflare answers for |
      | `SITE_DEPLOY_PORT` | Its SSH port, if not 22 |
      | `SITE_DEPLOY_USER` | `cyclewire-site` |
      | `SITE_DEPLOY_KEY` | The contents of `cyclewire-site`, the private key |
      | `SITE_DEPLOY_KNOWN_HOSTS` | What `ssh-keyscan -p <port> <host>` prints |
      | `SITE_DEPLOY_PATH` | `<web root>/labs/cyclewire`, the folder from step 1 |

      The workflow refuses any path that does not end in `cyclewire`: the copy deletes
      what the build does not have, so it never runs anywhere else.

   4. Add the variable `SITE_DEPLOY` with the value `server`, then run the Pages workflow
      by hand (Actions, then Pages, then Run workflow). Removing the variable puts the
      site back on GitHub Pages at the next run.

   The cyclechain.io site is published from its own repository with rsync too, as a
   mirror of its build: its `deploy/keep.rsync` has to keep `labs/cyclewire/`, or its
   next deploy would delete this site.

## cdnjs

jsDelivr and unpkg serve every npm version automatically; cdnjs needs a one-time listing,
and accepts libraries once they have some adoption. After that, cdnjs imports new versions
from npm by itself. To apply, fork [cdnjs/packages](https://github.com/cdnjs/packages),
add `packages/c/cyclewire.json` and open a pull request:

```json
{
  "name": "cyclewire",
  "description": "Zero-initial-JS selective activation engine. Turn server-rendered HTML into instant interactivity on intent.",
  "keywords": ["resumability", "event-delegation", "lazy-loading", "progressive-enhancement", "server-rendered", "zero-dependency"],
  "authors": [{ "name": "CycleChain", "url": "https://cyclechain.io" }],
  "license": "MIT",
  "homepage": "https://cyclechain.github.io/CycleWire/",
  "repository": { "type": "git", "url": "https://github.com/CycleChain/CycleWire.git" },
  "filename": "cyclewire.global.min.js",
  "autoupdate": {
    "source": "npm",
    "target": "cyclewire",
    "fileMap": [{ "basePath": "dist", "files": ["*.min.js", "*.min.js.map"] }]
  }
}
```

cdnjs has no `@1`-style ranges, so its URLs always name an exact version.

## `create-cyclewire`

The starter templates are a package of their own, in `packages/create-cyclewire/`, with
their own version and changelog. CI builds each template and uses it in Chromium on every
change.

1. **The first version, by hand.** npm can only trust a workflow for a package that
   exists, so publish 1.0.0 yourself: `cd packages/create-cyclewire && npm publish
   --access public` (npm asks for your second factor).
2. **Then trust the workflow.** In the package's settings on npmjs.com, add a trusted
   publisher: GitHub Actions, `CycleChain/CycleWire`, workflow `create-cyclewire.yml`.
3. **Every later version.** Update `version` and `CHANGELOG.md` in
   `packages/create-cyclewire/`, commit, and push a tag named after it:

   ```bash
   git tag -a create-cyclewire-v1.0.1 -m "create-cyclewire v1.0.1"
   git push origin main --follow-tags
   ```

   `.github/workflows/create-cyclewire.yml` tests the templates and publishes it with
   provenance, skipping a version npm already has.

## If something fails

- **Tests or budgets fail:** nothing was published. Fix, commit, delete and recreate the
  tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), push again.
- **npm publish succeeded, release step failed:** re-run the workflow. The publish step
  skips versions that are already on npm.
- **npm refused trusted publishing:** nothing was published. The publish step prints the
  repository, workflow and environment that GitHub vouched for, and npm's reason. Make the
  trusted publisher settings match them, check again by running the workflow by hand,
  then re-run the release. Without that check, npm falls back to a token it does not have
  and reports `E404 Not Found`.
- **A bad version reached npm:** publish a fixed patch release. Use `npm deprecate` rather
  than unpublishing.
