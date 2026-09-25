# Releasing (maintainers)

CycleWire uses [Semantic Versioning](https://semver.org), annotated git tags (`vX.Y.Z`),
GitHub Releases and npm with trusted publishing. Nothing is published from a laptop
after the first release.

## Every release

1. Make sure `main` is green in CI.
2. Update `version` in `package.json` (`npm version <patch|minor|major> --no-git-tag-version`).
3. Move the "Unreleased" notes in `CHANGELOG.md` under the new version and date, and
   update the compare links at the bottom.
4. Commit: `git commit -am "chore(release): X.Y.Z"`.
5. Tag and push:

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
   `CycleWire` and workflow `release.yml`. Afterwards, in the package's publishing
   access settings, you can disallow tokens altogether.

3. **GitHub Pages.** In the repository settings, set Pages to be deployed by "GitHub
   Actions". The `github-pages` environment then accepts deployments from `main`, which
   is where the Pages workflow deploys from.

## If something fails

- **Tests or budgets fail:** nothing was published. Fix, commit, delete and recreate the
  tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), push again.
- **npm publish succeeded, release step failed:** re-run the workflow. The publish step
  skips versions that are already on npm.
- **A bad version reached npm:** publish a fixed patch release. Use `npm deprecate` rather
  than unpublishing.
