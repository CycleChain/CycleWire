# Releasing (maintainers)

CycleWire uses [Semantic Versioning](https://semver.org), annotated git tags (`vX.Y.Z`),
GitHub Releases and npm with trusted publishing. Nothing is published from a laptop
after the first release.

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

The landing page and the live examples redeploy on every push to `main`
(`.github/workflows/pages.yml`), the release commit included.

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
