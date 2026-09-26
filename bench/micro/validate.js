/**
 * Validates micro results against schema/micro.v1.json, as runner/validate.js
 * does for the harness's results.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../schema/micro.v1.json', import.meta.url), 'utf8'));
const check = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

/** @param {unknown} value @returns {string[]} what is wrong, or nothing */
export const validate = (value) => (check(value) ? [] : (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`));
