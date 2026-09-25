# Results

Each file is one run of `node run.js` for one profile, and validates against
[`../schema/results.v1.json`](../schema/results.v1.json). It records the machine, the
browser, the installed version of every stack, the conformance checks, every raw
sample and the summaries computed from them.

Files named `*.local.json` are local runs and are not committed. Published results
come from the `measure` job of the Benchmark workflow. To read one:

```bash
node scripts/report.js results/<file>.json
```
