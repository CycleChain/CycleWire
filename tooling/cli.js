/**
 * The `cyclewire` command (tooling/bin.js runs it).
 *
 *   cyclewire check    checks the cw-* values in the templates against the actions
 *   cyclewire types    writes a declaration file with the action names and their props
 *
 * Exit status: 0 when nothing is wrong (warnings allowed), 1 when a check
 * found an error, 2 for a usage or configuration error.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { scanActions } from './actions.js';
import { check } from './check.js';
import { ConfigError, loadConfig } from './config.js';
import { writeDeclarations } from './types.js';

const HELP = `Usage: cyclewire <command> [options]

Commands:
  check                 Check the cw-* values in your templates against your actions
  types                 Write a declaration file with your action names and their props

Options:
  --config <file>       JSON configuration (default: cyclewire.config.json, or "cyclewire" in package.json)
  --root <dir>          The project's directory (default: the current directory)
  --actions <dir>       The actions directory (default: the first of src/actions, resources/js/actions, …)
  --manifest <file>     Read the registered actions from the manifest cyclewire/vite writes (check)
  --templates <glob>    Templates to check; repeat for more (check)
  --prefix <prefix>     The attribute prefix (default: cw-)
  --unused              Also warn about actions no template uses (check)
  --format <format>     text (default), github or json (check)
  --out <file>          Where to write the declarations (types; default: next to the actions directory)
  -h, --help            Show this help
  -v, --version         Show the version
`;

/** @param {string} value */
const githubEscape = (value, property = false) => {
    const text = value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    return property ? text.replace(/:/g, '%3A').replace(/,/g, '%2C') : text;
};

/**
 * @param {import('./check.js').Report} report
 * @param {string} format
 */
function print(report, format) {
    const { problems } = report;
    if (format === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    for (const problem of problems) {
        if (format === 'github') {
            const where = problem.file ? ` file=${githubEscape(problem.file, true)}${problem.line ? `,line=${problem.line}` : ''}${problem.column ? `,col=${problem.column}` : ''},title=${githubEscape(problem.code, true)}` : ` title=${githubEscape(problem.code, true)}`;
            console.log(`::${problem.severity}${where}::${githubEscape(problem.message)}`);
        } else {
            const where = problem.file ? `${problem.file}${problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : ''}  ` : '';
            console.log(`${where}${problem.severity}  ${problem.message}  (${problem.code})`);
        }
    }
    if (format === 'text') {
        const errors = problems.filter((problem) => problem.severity === 'error').length;
        const warnings = problems.length - errors;
        const counted = (/** @type {number} */ count, /** @type {string} */ noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
        const summary = `${counted(errors, 'error')}, ${counted(warnings, 'warning')} in ${counted(report.files, 'template')}: ${counted(report.references, 'value')} checked against ${report.source}`;
        console.log(`${problems.length ? '\n' : ''}${summary}${report.dynamic ? `, ${counted(report.dynamic, 'value')} built by the templates not checked` : ''}.`);
    }
}

/** @param {string[]} argv */
export async function main(argv) {
    /** @type {ReturnType<typeof parseArgs>} */
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                config: { type: 'string' },
                root: { type: 'string' },
                actions: { type: 'string' },
                manifest: { type: 'string' },
                templates: { type: 'string', multiple: true },
                prefix: { type: 'string' },
                unused: { type: 'boolean' },
                format: { type: 'string' },
                out: { type: 'string' },
                help: { type: 'boolean', short: 'h' },
                version: { type: 'boolean', short: 'v' },
            },
        });
    } catch (error) {
        console.error(`${/** @type {Error} */ (error).message}\n\n${HELP}`);
        return 2;
    }
    const { values, positionals } = parsed;
    if (values.version) {
        const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
        console.log(pkg.version);
        return 0;
    }
    const [command, ...rest] = positionals;
    if (values.help || !command) {
        console.log(HELP);
        return command || values.help ? 0 : 2;
    }
    if (rest.length || !['check', 'types'].includes(command)) {
        console.error(`Unknown command: ${[command, ...rest].join(' ')}\n\n${HELP}`);
        return 2;
    }
    const format = /** @type {string} */ (values.format ?? 'text');
    if (!['text', 'github', 'json'].includes(format)) {
        console.error(`--format must be text, github or json.`);
        return 2;
    }

    try {
        const config = await loadConfig({
            root: /** @type {string | undefined} */ (values.root),
            config: /** @type {string | undefined} */ (values.config),
            actions: /** @type {string | undefined} */ (values.actions),
            manifest: /** @type {string | undefined} */ (values.manifest),
            templates: /** @type {string[] | undefined} */ (values.templates),
            prefix: /** @type {string | undefined} */ (values.prefix),
            types: /** @type {string | undefined} */ (values.out),
        });
        if (command === 'types') {
            if (!config.actions) throw new ConfigError('"types" reads the actions directory: set "actions", or pass --actions.');
            const { modules } = await scanActions(config.actions, { root: config.root });
            const path = resolve(config.root, config.types);
            const written = await writeDeclarations(modules, path, config.actions);
            console.log(`${written ? 'Wrote' : 'Unchanged:'} ${config.types}, ${modules.length} action ${modules.length === 1 ? 'module' : 'modules'} from ${config.actions}.`);
            return 0;
        }
        const report = await check(config, { unused: Boolean(values.unused) });
        print(report, format);
        return report.problems.some((problem) => problem.severity === 'error') ? 1 : 0;
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(error.message);
            return 2;
        }
        throw error;
    }
}
