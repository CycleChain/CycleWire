#!/usr/bin/env node
/**
 * Copies the hand-written declarations in src/ (every *.d.ts but env.d.ts,
 * which only declares the build-time constants) next to the ones tsc emits
 * into types/: tsc reads them, but does not copy them.
 */
import { copyFile, readdir } from 'node:fs/promises';

const files = (await readdir('src')).filter((file) => file.endsWith('.d.ts') && file !== 'env.d.ts');
for (const file of files) await copyFile(`src/${file}`, `types/${file}`);
console.log(`Copied ${files.join(', ')} → types/`);
