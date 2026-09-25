# Contributing to CycleWire

Thanks for helping. CycleWire is small on purpose, so the bar for new code is: does it
make the common case faster or safer, and does it earn its bytes?

## Setup

```bash
git clone https://github.com/CycleChain/CycleWire.git
cd CycleWire
npm install
npx playwright install --with-deps chromium firefox webkit
```

Already have Google Chrome? Skip the Chromium download and run the Chromium project on
your installed browser with `PW_CHANNEL=chrome`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the landing page on http://127.0.0.1:4173 (build first) |
| `npm run build` | Builds `dist/` and the type declarations in `types/` |
| `npm run examples` | Builds the [examples](examples/README.md), served under `/examples/` |
| `npm run typecheck` | Type-checks the JSDoc in `src/` |
| `npm run test:unit` | Node tests for the pure logic (`test/unit`) |
| `npm run test:e2e` | Playwright tests in Chromium, Firefox and WebKit (`test/e2e`) |
| `npm run size` | Measures every bundle and fails if a budget is exceeded |

The end-to-end tests run against the built files, so run `npm run build` before
`npm run test:e2e`. They build the examples themselves, since some tests run against
them.

The benchmark lives in [`bench/`](bench/README.md), with its own `package.json`; its
[contributing guide](bench/CONTRIBUTING.md) explains how to add or correct a stack.

## Guidelines

- **Zero runtime dependencies.** Development tooling is limited to esbuild, TypeScript
  and Playwright, plus the frameworks and libraries that the examples and their tests
  integrate with. None of them ship with the package.
- **Plain JavaScript with JSDoc types.** The source must stay readable without a build.
- **Every behaviour change comes with a test.** Fixtures live in `test/fixtures`; use
  `window.__wait(id)` / `window.__open(id)` to hold a run open instead of timeouts.
- **`html` is fuzzed.** `test/unit/html.property.test.js` checks its escaping and URL rules
  on generated inputs, and `test/e2e/html-oracle.spec.js` checks its context analysis
  against each browser's HTML parser. The seed changes daily; a failure prints it, and
  `FUZZ_SEED=<seed>` replays it (`FUZZ_RUNS` sets the number of cases).
- **Mind the budgets.** `scripts/size.js` holds the limits. Raising one is a deliberate
  decision that belongs in the pull request description.
- **Document what users see.** Update `docs/`, the README and `CHANGELOG.md`
  (under "Unreleased").
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, …).

## Reporting bugs and proposing features

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
