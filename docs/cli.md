# Command line: `cyclewire check` and `cyclewire types`

The package installs a `cyclewire` command. It reads your templates and your actions
without running either, needs Node 22 or later, and has no dependencies.

```sh
npx cyclewire check          # the data-cw-* values in your templates, against your actions
npx cyclewire types          # a declaration file with your action names and their props
```

## `cyclewire check`

Markup names its code in plain strings: `data-cw-action="cart#add"` fails silently when
the file is `cart.js` but the export is `addItem`, or when a template says `crat#add`.
`check` finds every `data-cw-*` value in your templates and reports:

| Code | Problem |
| --- | --- |
| `unknown-action` | The module is not registered, with the closest names as suggestions |
| `unknown-export` | The module has no such export, with suggestions |
| `no-handler` | A bare name, but the module has neither a `run` nor a default export |
| `invalid-name` | Not a name the registry accepts (letters, digits, `_`, `-`, `.`, then `#export`) |
| `invalid-trigger`, `invalid-preload`, `invalid-concurrency`, `invalid-debounce` | A value CycleWire does not understand |
| `invalid-props` | `data-cw-props` that is not valid JSON |
| `duplicate-name`, `invalid-file-name` | Warnings about the actions directory itself |
| `unused-action` | With `--unused`: an export no template names (warning) |

```text
resources/views/cart.blade.php:12:9  error  "cart" has no export "ad"; did you mean "cart#add"?  (unknown-export)

1 error, 0 warnings in 48 templates: 213 values checked against resources/js/actions, 6 values built by the templates not checked.
```

It reads HTML and the server template languages (Blade, ERB, Django, Jinja, Twig,
Liquid, Handlebars), JavaScript and TypeScript with JSX, Vue, Svelte and Astro, including
string literals in expressions (`data-cw-action={'cart#add'}`,
`:data-cw-action="'cart#add'"`), and the [server helpers](server-helpers.md) (`@cw(…)`,
`cw(…)`, `cwAttrs(…)`, `{% cw … %}`). Comments are skipped. A value the template language
builds, such as `data-cw-action="{{ $action }}"`, cannot be known before the page runs,
so it is counted rather than checked.

Exit status: `0` when there is no error (warnings allowed), `1` when there is one, `2`
for a usage or configuration error.

### Where the names come from

1. **An actions directory** (the default): every file in it, named as `fromGlob()` and
   the [Vite plugin](vite.md) name them (`cart/add.js` is `cart.add`), with the exports
   found in each file. The first of `src/actions`, `resources/js/actions`,
   `app/javascript/actions`, `assets/js/actions`, `static/js/actions`, `js/actions` and
   `actions` that exists is used unless you choose one.
2. **The Vite plugin's manifest** (`--manifest dist/.vite/cyclewire.json`): the names and
   exports of the last build.
3. **A list of names** in the configuration, for apps that register URLs by hand:
   `"names": ["cart#add", "search"]`. A bare name says nothing about exports, so only the
   module is checked.

A module that re-exports everything from another (`export * from './x.js'`) is checked by
name only.

### In CI

```yaml
- run: npx cyclewire check --format github
```

`--format github` prints annotations that GitHub shows on the pull request's lines;
`--format json` prints the report for other tools.

## `cyclewire types`

Writes a declaration file that lists every action by name, mapped to its handler:

```ts
// src/cyclewire-actions.d.ts, generated
interface CycleWireActions {
    "cart#add": typeof import("./actions/cart.js")["add"];
    "like": typeof import("./actions/like.js")["run"];
}
```

With it, `run()` and `preload()` accept only those names, and `PropsOf<'cart#add'>` is
the props that handler declares with `defineAction<Props>()`. See [TypeScript](typescript.md).
The file goes next to the actions directory unless `--out` or `"types"` says otherwise,
and is rewritten only when it changes. JavaScript actions are typed from their JSDoc, so
the project's `tsconfig.json` needs `allowJs`.

## Configuration

Options come from `cyclewire.config.json`, or from a `cyclewire` key in `package.json`,
and the command line overrides them. Only JSON is read: configuring the tool never runs
your code.

```json
{
    "actions": "resources/js/actions",
    "templates": ["resources/views/**/*.blade.php", "resources/js/**/*.{js,vue}"],
    "prefix": "cw-",
    "types": "resources/js/cyclewire-actions.d.ts"
}
```

| Option | Command line | Default |
| --- | --- | --- |
| `actions` | `--actions <dir>` | The first common actions directory that exists |
| `names` | – | – |
| `manifest` | `--manifest <file>` | – |
| `templates` | `--templates <glob>` (repeat for more) | Every template and JSX file, and `src/**/*.{js,ts}` |
| `prefix` | `--prefix <prefix>` | `cw-` |
| `types` | `--out <file>` | `cyclewire-actions.d.ts` next to the actions directory |

Globs support `*`, `**`, `?` and `{a,b}`, and a leading `!` excludes. `node_modules`,
`vendor`, `dist`, `build`, `coverage` and `.git` are only searched when a pattern names
them. `--root <dir>` runs the command for another directory, and `--config <file>` uses
another configuration file.
