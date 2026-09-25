/**
 * Validates results and manifests against the JSON Schemas in schema/.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

const schema = (name) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const results = ajv.compile(schema('results.v1.json'));
const manifest = ajv.compile(schema('bench.v1.json'));

const problems = (check, value) => (check(value) ? [] : check.errors.map((error) => `${error.instancePath || '/'} ${error.message}`));

/** @returns {string[]} what is wrong, or nothing */
export const validate = (value) => problems(results, value);
export const validateManifest = (value) => problems(manifest, value);
