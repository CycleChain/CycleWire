#!/usr/bin/env node
/**
 * npm create cyclewire@latest [directory] -- --template <vite | vanilla | astro | laravel>
 *
 * Asks for what is missing when it runs in a terminal, and copies the
 * template. The laravel template adds files to an existing Laravel app and
 * leaves the ones it already has alone.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { create, TEMPLATES } from './create.js';

const HELP = `Usage: npm create cyclewire@latest [directory] -- --template <name>

Templates:
${Object.entries(TEMPLATES).map(([name, description]) => `  ${name.padEnd(9)} ${description}`).join('\n')}

Options:
  -t, --template <name>   the template to use
  -h, --help              show this help
`;

/** The package manager that ran us, for the next steps. */
function manager() {
    const agent = process.env.npm_config_user_agent ?? '';
    return agent.startsWith('pnpm') ? 'pnpm' : agent.startsWith('yarn') ? 'yarn' : agent.startsWith('bun') ? 'bun' : 'npm';
}

/** @param {string} template @param {string} dir */
function nextSteps(template, dir) {
    const pm = manager();
    const run = (script) => (pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`);
    const cd = `cd ${/\s/.test(dir) ? JSON.stringify(dir) : dir}`;
    if (template === 'vanilla') return [cd, `${pm === 'npm' ? 'npm' : pm} start`];
    if (template === 'laravel') {
        return [
            cd,
            `${pm} ${pm === 'yarn' ? 'add' : 'install'} cyclewire`,
            'Then follow CYCLEWIRE.md: two lines in vite.config.js and resources/js/app.js, and a route.',
        ];
    }
    return [cd, `${pm} install`, run('dev')];
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: { template: { type: 'string', short: 't' }, help: { type: 'boolean', short: 'h' } },
    });
    if (values.help) {
        console.log(HELP);
        return 0;
    }
    let [dir] = positionals;
    let template = values.template;
    const interactive = process.stdin.isTTY && process.stdout.isTTY;
    if ((!dir || !template) && !interactive) {
        console.error(`Name a directory and a template.\n\n${HELP}`);
        return 2;
    }
    if (!dir || !template) {
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try {
            if (!dir) dir = (await prompt.question('Project directory (cyclewire-app): ')).trim() || 'cyclewire-app';
            if (!template) {
                const names = Object.keys(TEMPLATES);
                console.log(names.map((name, i) => `  ${i + 1}. ${name.padEnd(9)} ${TEMPLATES[name]}`).join('\n'));
                const answer = (await prompt.question('Template (1): ')).trim() || '1';
                template = names[Number(answer) - 1] ?? answer;
            }
        } finally {
            prompt.close();
        }
    }
    try {
        const { written, skipped } = await create({ dir, template: /** @type {any} */ (template), merge: template === 'laravel' });
        console.log(`\nCreated a CycleWire ${template} project in ${dir} (${written.length} files).`);
        if (skipped.length) console.log(`Left alone, since the project has them already: ${skipped.join(', ')}.`);
        console.log(`\nNext:\n${nextSteps(template, dir).map((step) => `  ${step}`).join('\n')}\n`);
        return 0;
    } catch (error) {
        console.error(/** @type {Error} */ (error).message);
        return 1;
    }
}

process.exitCode = await main();
