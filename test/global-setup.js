// Builds the examples before the browser tests, which run against them
// (examples.spec.js, frameworks.spec.js, libraries.spec.js). They import
// CycleWire from dist/, so `npm run build` has to have run first, as it does
// in CI. EXAMPLES=production tests the minified builds the live demos use.
import { execFileSync } from 'node:child_process';

export default function globalSetup() {
    const args = process.env.EXAMPLES === 'production' ? ['--production'] : [];
    execFileSync(process.execPath, ['examples/build.js', ...args], { stdio: 'inherit' });
}
