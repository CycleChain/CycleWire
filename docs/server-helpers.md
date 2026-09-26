# Server helpers

CycleWire reads plain `cw-*` attributes, so any template can write them by hand. Two
things can go wrong when it does. `cw-props` holds JSON inside an HTML attribute, so
one quote in a product name can end the attribute early. And a misspelt action or option
does nothing, without an error.

The helpers on this page write the attributes for you: one `cw()` function per stack, with
the same contract in each.

```blade
<button @cw('cart#add', ['sku' => $product->sku])>Add to cart</button>
```

```html
<button cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}">Add to cart</button>
```

They are copy-in snippets, not packages: copy the file for your stack into your project and
make it yours. Each helper is tested in its own language against the same cases,
[`test/snippets/vectors.json`](../test/snippets/vectors.json), and must match them byte for
byte. CI also checks that the code on this page is the code it tests.

## The contract

`cw(action, props = null, options = {})` returns the attributes as one string, to print
inside an HTML start tag.

**`action`** is `module` or `module#export`, as in `cw-action`. Module names are made of
ASCII letters, digits, `_`, `.` and `-`; exports of ASCII letters, digits, `_` and `$`.

**`props`** becomes `cw-props`, unless it is null (`None` in Python, `nil` in Ruby). It
is encoded as compact JSON: map keys keep their order, and non-ASCII text, `/` and the line
separators U+2028 and U+2029 stay as they are. Strings, integers, booleans, null, lists and
maps nest as deep as you like. Floats work too, but each language prints them its own way
(`1.0` stays `1.0` in Python and becomes `1` in JavaScript), so the tests leave them out.

**`options`**:

| Option | Takes | Prints |
| --- | --- | --- |
| `on` | an event name: lowercase letters, digits, `:`, `_` and `-` | `cw-on-<event>` in place of `cw-action` |
| `trigger` | `load`, `idle`, `visible` or `media:<query>` | `cw-trigger` |
| `preload` | `intent`, `visible`, `idle`, `load` or `none` | `cw-preload` |
| `concurrency` | `drop`, `restart`, `latest` or `parallel` | `cw-concurrency` |
| `debounce` | a whole number of milliseconds, 0 or more | `cw-debounce` |
| `once` | `true` | `cw-once`, with no value |
| `prevent` | `true`, or event names separated by single spaces: `click submit`, `none` | `cw-prevent`, with no value for `true` |
| `prefix` | the prefix you give `start()`: `''`, or lowercase letters, digits and `-`, ending in `-` | the `cw-` in every name (`cw-` by default; `''` means `data-`) |

An option set to null or `false` is left out, so a value can come straight from a variable.
An unknown option, or a name or value the table does not allow, throws the language's
argument error: `InvalidArgumentException` in PHP, `ArgumentError` in Ruby, `ValueError` in
Python and `TypeError` in JavaScript. A typo fails where you wrote it, not silently in the
browser. An event outside CycleWire's default list still needs
[`listen()`](js-api.md#listentypes-options).

The output has a fixed shape: `cw-action` (or `cw-on-<event>`), then
`cw-props`, then the options in the table's order. Each value is in double quotes and
escaped: `&`, `"`, `'`, `<` and `>` become `&amp;`, `&quot;`, `&#39;`, `&lt;` and `&gt;`.
One space separates the attributes, with none before or after them. The
[HTML API](html-api.md) explains what each attribute does.

## What the escaping covers

The helpers escape for one place: between the attributes of an HTML start tag, as in
`<button @cw(…)>`. Their output is not safe in JavaScript, CSS, a URL, an unquoted
attribute or another attribute's value, so print it nowhere else.

Escaping keeps your props from breaking the markup around them. It does not make HTML that
users wrote safe to render, and it cannot stop injected markup from carrying `cw-*`
attributes of its own. [Security](security.md) covers both: sanitize user content, and wrap
it in `cw-ignore`.

Props are public. Everything you pass ends up in the page source, so pass the values an
action needs, not a whole model.

## PHP and Laravel

Copy [`cw.php`](../test/snippets/php/cw.php) into your project, for example as
`app/Support/cw.php`, and have Composer load it on every request by adding it to
`autoload.files` in `composer.json`:

```json
{
    "autoload": {
        "files": ["app/Support/cw.php"]
    }
}
```

Then run `composer dump-autoload`. Without Composer, `require` the file. It needs PHP 8.1 or
newer.

<!-- snippet: test/snippets/php/cw.php -->
```php
<?php

/**
 * CycleWire attributes for server-rendered HTML: cw('cart#add', ['sku' => $sku]).
 * From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
 */

declare(strict_types=1);

namespace CycleWire;

/**
 * The attributes, escaped for HTML, to print inside a start tag.
 * cw('cart#add', ['sku' => 'wire-01'], ['trigger' => 'visible']) returns
 * cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" cw-trigger="visible"
 *
 * @param string $action "module" or "module#export"
 * @param mixed $props anything json_encode() takes, or null for none; [] is a list,
 *                     so pass (object) [] for an empty map
 * @param array<string, mixed> $options on, trigger, preload, concurrency, debounce, once, prevent, prefix
 * @throws \InvalidArgumentException for a bad name, option or value
 * @throws \JsonException for props that JSON cannot hold
 */
function cw(string $action, mixed $props = null, array $options = []): string
{
    // Options printed after the action and props, in this order, with the strings
    // they accept. debounce takes an integer instead, and once only true.
    $strings = [
        'trigger' => '/\A(?:load|idle|visible|media:.+)\z/s',
        'preload' => '/\A(?:intent|visible|idle|load|none)\z/',
        'concurrency' => '/\A(?:drop|restart|latest|parallel)\z/',
        'debounce' => null,
        'once' => null,
        'prevent' => '/\A[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*\z/',
    ];
    foreach (array_keys($options) as $name) {
        if (!array_key_exists($name, $strings) && $name !== 'on' && $name !== 'prefix') {
            throw new \InvalidArgumentException("CycleWire: unknown option \"$name\"");
        }
    }
    if (preg_match('/\A[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?\z/', $action) !== 1) {
        throw new \InvalidArgumentException("CycleWire: invalid action \"$action\"");
    }
    // null and false leave an option out, so values can come straight from variables.
    $options = array_filter($options, fn (mixed $value): bool => $value !== null && $value !== false);
    $prefix = $options['prefix'] ?? 'cw-';
    if (!is_string($prefix) || preg_match('/\A(?:[a-z0-9-]*-)?\z/', $prefix) !== 1) {
        throw new \InvalidArgumentException('CycleWire: invalid prefix ' . var_export($prefix, true));
    }
    $on = $options['on'] ?? null;
    if ($on !== null && (!is_string($on) || preg_match('/\A[a-z][a-z0-9:_-]*\z/', $on) !== 1)) {
        throw new \InvalidArgumentException('CycleWire: invalid on ' . var_export($on, true));
    }

    // An empty prefix means data-: a bare "action" is already a form attribute.
    $base = $prefix === '' ? 'data-' : $prefix;
    $attributes = [$base . ($on === null ? 'action' : "on-$on") => $action];
    if ($props !== null) {
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;
        $attributes["{$base}props"] = json_encode($props, $flags);
    }
    foreach ($strings as $name => $pattern) {
        if (!array_key_exists($name, $options)) {
            continue;
        }
        $value = $options[$name];
        $valid = match (true) {
            $value === true => $name === 'once' || $name === 'prevent',
            $name === 'debounce' => is_int($value) && $value >= 0,
            default => is_string($value) && $pattern !== null && preg_match($pattern, $value) === 1,
        };
        if (!$valid) {
            throw new \InvalidArgumentException("CycleWire: invalid $name " . var_export($value, true));
        }
        $attributes[$base . $name] = $value === true ? null : (string) $value;
    }

    $escapes = ['&' => '&amp;', '"' => '&quot;', "'" => '&#39;', '<' => '&lt;', '>' => '&gt;'];
    $html = [];
    foreach ($attributes as $name => $value) {
        $html[] = $value === null ? $name : $name . '="' . strtr($value, $escapes) . '"';
    }
    return implode(' ', $html);
}
```

For Blade, register a `@cw` directive in the `boot()` method of
`App\Providers\AppServiceProvider`. It prints `cw()`'s result with `echo`, since `{{ }}`
would escape it a second time. Run `php artisan view:clear` once, because views compiled
earlier do not know the directive.

<!-- snippet: test/snippets/php/AppServiceProvider.php -->
```php
<?php

namespace App\Providers;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // <button @cw('cart#add', ['sku' => $sku])>: cw() has escaped every value,
        // so the directive echoes its result as it is, without {{ }}.
        Blade::directive('cw', fn (string $expression) => "<?php echo \\CycleWire\\cw({$expression}); ?>");
    }
}
```

In a template:

```blade
<button @cw('cart#add', ['sku' => $product->sku, 'qty' => 1])>Add to cart</button>

{{-- Load the reviews as they scroll into view. --}}
<section @cw('reviews#load', ['product' => $product->id], ['trigger' => 'visible'])>…</section>

{{-- A keydown binding, without props. --}}
<input type="search" @cw('search#keys', null, ['on' => 'keydown'])>
```

A plain PHP template calls the function: `<button <?= \CycleWire\cw('cart#add', ['sku' => $sku]) ?>>`.

A PHP array whose keys are 0, 1, 2… in order is a JSON list, so `[]` prints `[]`. For a map
that may be empty, pass an object: `(object) []` prints `{}`.

## Ruby on Rails

Copy [`cycle_wire.rb`](../test/snippets/ruby/cycle_wire.rb) into `config/initializers/`, or
into `lib/` when your app autoloads it (`config.autoload_lib`, the default since Rails 7.1).
Copy [`cycle_wire_helper.rb`](../test/snippets/ruby/cycle_wire_helper.rb) into
`app/helpers/`, which makes `cw` available in every view. The module runs on Ruby 2.6 and
newer; the helper is written for Ruby 3.

<!-- snippet: test/snippets/ruby/cycle_wire.rb -->
```ruby
# frozen_string_literal: true

# CycleWire attributes for server-rendered HTML: CycleWire.cw('cart#add', { sku: sku }).
# From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).

require 'json'

module CycleWire
  ACTION = /\A[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?\z/
  EVENT = /\A[a-z][a-z0-9:_-]*\z/
  PREFIX = /\A(?:[a-z0-9-]*-)?\z/
  # Options printed after the action and props, in this order, with the strings
  # they accept. debounce takes an Integer instead, and once only true.
  OPTIONS = {
    trigger: /\A(?:load|idle|visible|media:.+)\z/m,
    preload: /\A(?:intent|visible|idle|load|none)\z/,
    concurrency: /\A(?:drop|restart|latest|parallel)\z/,
    debounce: nil,
    once: nil,
    prevent: /\A[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*\z/
  }.freeze
  ESCAPES = { '&' => '&amp;', '"' => '&quot;', "'" => '&#39;', '<' => '&lt;', '>' => '&gt;' }.freeze

  # The attributes, escaped for HTML, to print inside a start tag.
  # CycleWire.cw('cart#add', { sku: 'wire-01' }, trigger: 'visible') returns
  # cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" cw-trigger="visible"
  # Raises ArgumentError for a bad name, option or value.
  def self.cw(action, props = nil, options = {})
    options.each_key do |name|
      next if OPTIONS.key?(name) || name == :on || name == :prefix

      raise ArgumentError, "CycleWire: unknown option #{name.inspect}"
    end
    raise ArgumentError, "CycleWire: invalid action #{action.inspect}" unless action.is_a?(String) && ACTION.match?(action)

    # nil and false leave an option out, so values can come straight from variables.
    options = options.reject { |_, value| value.nil? || value == false }
    prefix = options.fetch(:prefix, 'cw-')
    raise ArgumentError, "CycleWire: invalid prefix #{prefix.inspect}" unless prefix.is_a?(String) && PREFIX.match?(prefix)

    on = options[:on]
    raise ArgumentError, "CycleWire: invalid on #{on.inspect}" unless on.nil? || (on.is_a?(String) && EVENT.match?(on))

    # An empty prefix means data-: a bare "action" is already a form attribute.
    base = prefix.empty? ? 'data-' : prefix
    binds = on.nil? ? 'action' : "on-#{on}"
    attributes = { "#{base}#{binds}" => action }
    attributes["#{base}props"] = JSON.generate(props) unless props.nil?
    OPTIONS.each_key do |name|
      next unless options.key?(name)

      value = options[name]
      raise ArgumentError, "CycleWire: invalid #{name} #{value.inspect}" unless valid?(name, value)

      attributes["#{base}#{name}"] = value == true ? nil : value.to_s
    end
    attributes.map { |name, value| value.nil? ? name : %(#{name}="#{value.gsub(/[&"'<>]/, ESCAPES)}") }.join(' ')
  end

  def self.valid?(name, value)
    return %i[once prevent].include?(name) if value == true
    return value.is_a?(Integer) && value >= 0 if name == :debounce

    value.is_a?(String) && !OPTIONS[name].nil? && OPTIONS[name].match?(value)
  end
  private_class_method :valid?
end
```

<!-- snippet: test/snippets/ruby/cycle_wire_helper.rb -->
```ruby
# frozen_string_literal: true

# <button <%= cw('cart#add', { sku: @sku }, trigger: 'visible') %>> in any view.
# From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
module CycleWireHelper
  # CycleWire.cw has escaped every value, so the result is marked safe to print.
  def cw(action, props = nil, **options) = CycleWire.cw(action, props, options).html_safe
end
```

In a view, put props in braces, so Ruby does not read them as options. Options are keywords,
with string values:

```erb
<button <%= cw('cart#add', { sku: @product.sku, qty: 1 }) %>>Add to cart</button>

<section <%= cw('reviews#load', { product: @product.id }, trigger: 'visible') %>>…</section>

<input type="search" <%= cw('search#keys', on: 'keydown') %>>
```

Outside views, `CycleWire.cw` takes the options as a hash in third place:
`CycleWire.cw('menu', nil, trigger: 'idle')`.

## Python and Django

Copy [`cyclewire.py`](../test/snippets/python/cyclewire.py) into one of your apps, and
[`cyclewire_tags.py`](../test/snippets/python/templatetags/cyclewire_tags.py) into the
app's `templatetags` package, a folder with an empty `__init__.py`. The app must be in
`INSTALLED_APPS`. It needs Python 3.8 or newer.

```text
shop/
    cyclewire.py
    templatetags/
        __init__.py
        cyclewire_tags.py
```

<!-- snippet: test/snippets/python/cyclewire.py -->
```python
"""CycleWire attributes for server-rendered HTML: cw('cart#add', {'sku': sku}).

From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
"""

import json
import re

_ACTION = re.compile(r'[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?')
_EVENT = re.compile(r'[a-z][a-z0-9:_-]*')
_PREFIX = re.compile(r'(?:[a-z0-9-]*-)?')
# Options printed after the action and props, in this order, with the strings
# they accept. debounce takes an integer instead, and once only True.
_OPTIONS = {
    'trigger': re.compile(r'load|idle|visible|media:.+', re.S),
    'preload': re.compile(r'intent|visible|idle|load|none'),
    'concurrency': re.compile(r'drop|restart|latest|parallel'),
    'debounce': None,
    'once': None,
    'prevent': re.compile(r'[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*'),
}
_ESCAPES = str.maketrans({'&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;'})


def _valid(name, value):
    if value is True:
        return name in ('once', 'prevent')
    if name == 'debounce':
        return type(value) is int and value >= 0  # not bool, which is an int too
    pattern = _OPTIONS[name]
    return isinstance(value, str) and pattern is not None and pattern.fullmatch(value) is not None


def cw(action, props=None, **options):
    """Return the attributes, escaped for HTML, to print inside a start tag.

    cw('cart#add', {'sku': 'wire-01'}, trigger='visible') returns
    cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" cw-trigger="visible"

    Raises ValueError for a bad name, option or value.
    """
    for name in options:
        if name not in _OPTIONS and name not in ('on', 'prefix'):
            raise ValueError(f'CycleWire: unknown option {name!r}')
    if not isinstance(action, str) or not _ACTION.fullmatch(action):
        raise ValueError(f'CycleWire: invalid action {action!r}')
    # None and False leave an option out, so values can come straight from variables.
    options = {k: v for k, v in options.items() if v is not None and v is not False}
    prefix = options.get('prefix', 'cw-')
    if not isinstance(prefix, str) or not _PREFIX.fullmatch(prefix):
        raise ValueError(f'CycleWire: invalid prefix {prefix!r}')
    on = options.get('on')
    if on is not None and (not isinstance(on, str) or not _EVENT.fullmatch(on)):
        raise ValueError(f'CycleWire: invalid on {on!r}')

    # An empty prefix means data-: a bare "action" is already a form attribute.
    base = prefix or 'data-'
    attributes = {base + ('action' if on is None else f'on-{on}'): action}
    if props is not None:
        # NaN and Infinity are not JSON, so they raise instead of breaking JSON.parse().
        attributes[f'{base}props'] = json.dumps(
            props, ensure_ascii=False, separators=(',', ':'), allow_nan=False
        )
    for name in _OPTIONS:
        if name not in options:
            continue
        value = options[name]
        if not _valid(name, value):
            raise ValueError(f'CycleWire: invalid {name} {value!r}')
        attributes[f'{base}{name}'] = None if value is True else str(value)
    return ' '.join(
        name if value is None else f'{name}="{value.translate(_ESCAPES)}"'
        for name, value in attributes.items()
    )
```

<!-- snippet: test/snippets/python/templatetags/cyclewire_tags.py -->
```python
"""{% cw %}: CycleWire attributes in Django templates.

    {% load cyclewire_tags %}
    <button {% cw 'cart#add' props trigger='visible' %}>Add to cart</button>

From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
"""

from django import template
from django.utils.safestring import mark_safe

from .. import cyclewire

register = template.Library()


@register.simple_tag
def cw(action, props=None, **options):
    # cyclewire.cw() has escaped every value, so the result is safe to print.
    return mark_safe(cyclewire.cw(action, props, **options))
```

Templates cannot build dictionaries, so the view passes the props:

```python
return render(request, 'product.html', {
    'product': product,
    'cart': {'sku': product.sku, 'qty': 1},
    'reviews': {'product': product.id},
})
```

In the template, options are keyword arguments:

```django
{% load cyclewire_tags %}
<button {% cw 'cart#add' cart %}>Add to cart</button>

<section {% cw 'reviews#load' reviews trigger='visible' %}>…</section>

<input type="search" {% cw 'search#keys' on='keydown' %}>
```

Elsewhere, call `cyclewire.cw()` and mark the result safe the way your template engine does,
such as `Markup(cw('cart#add', cart))` with Jinja2.

## JavaScript and JSX

Copy [`cw.js`](../test/snippets/node/cw.js) into your project. It is an ES module without
dependencies, so it runs wherever your templates do: Node, Deno, Bun, a Worker or a bundle.

<!-- snippet: test/snippets/node/cw.js -->
```js
/**
 * CycleWire attributes for server-rendered HTML and JSX: cwAttrs('cart#add', { sku })
 * in a template literal, <button {...cw('cart#add', { sku })}> in JSX.
 * From https://github.com/CycleChain/CycleWire/blob/main/docs/server-helpers.md (MIT).
 */

const ACTION = /^[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_$]*)?$/;
const EVENT = /^[a-z][a-z0-9:_-]*$/;
const PREFIX = /^(?:[a-z0-9-]*-)?$/;
// Options printed after the action and props, in this order.
const ORDER = ['trigger', 'preload', 'concurrency', 'debounce', 'once', 'prevent'];
// The strings each option accepts. debounce takes an integer instead, and once only true.
/** @type {Record<string, RegExp | undefined>} */
const STRINGS = {
    trigger: /^(?:load|idle|visible|media:.+)$/s,
    preload: /^(?:intent|visible|idle|load|none)$/,
    concurrency: /^(?:drop|restart|latest|parallel)$/,
    prevent: /^[a-z][a-z0-9:_-]*(?: [a-z][a-z0-9:_-]*)*$/,
};
/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

/**
 * @typedef {object} Options  null or false leaves an option out
 * @property {string | null | false} [on]  an event name: cw-on-<on> replaces cw-action
 * @property {string | null | false} [trigger]  load, idle, visible or media:<query>
 * @property {string | null | false} [preload]  intent, visible, idle, load or none
 * @property {string | null | false} [concurrency]  drop, restart, latest or parallel
 * @property {number | null | false} [debounce]  milliseconds
 * @property {boolean | null} [once]
 * @property {boolean | string | null} [prevent]  true, or event names such as 'click submit'
 * @property {string | null | false} [prefix]  the prefix given to start(); 'cw-' by default
 */

/** @param {string} value */
const escape = (value) => value.replace(/[&"'<>]/g, (char) => ENTITIES[char]);

/** @param {string} name @param {unknown} value */
function valid(name, value) {
    if (value === true) return name === 'once' || name === 'prevent';
    if (name === 'debounce') return Number.isSafeInteger(value) && Number(value) >= 0;
    return typeof value === 'string' && !!STRINGS[name]?.test(value);
}

/**
 * The attributes as an object to spread in JSX. Values are raw, since JSX
 * escapes attributes itself; once and prevent: true give '', a bare attribute.
 * @param {string} action `module` or `module#export`
 * @param {unknown} [props] anything JSON.stringify() takes, or null for none
 * @param {Options} [options]
 * @returns {Record<string, string>}
 * @throws {TypeError} for a bad name, option or value
 */
export function cw(action, props = null, options = {}) {
    for (const name of Object.keys(options)) {
        if (name !== 'on' && name !== 'prefix' && !ORDER.includes(name)) {
            throw new TypeError(`CycleWire: unknown option ${JSON.stringify(name)}`);
        }
    }
    if (typeof action !== 'string' || !ACTION.test(action)) {
        throw new TypeError(`CycleWire: invalid action ${JSON.stringify(action)}`);
    }
    // null, undefined and false leave an option out, so values can come straight from variables.
    /** @type {Record<string, unknown>} */
    const given = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value != null && value !== false),
    );
    const { prefix = 'cw-', on } = given;
    if (typeof prefix !== 'string' || !PREFIX.test(prefix)) {
        throw new TypeError(`CycleWire: invalid prefix ${JSON.stringify(prefix)}`);
    }
    if (on !== undefined && (typeof on !== 'string' || !EVENT.test(on))) {
        throw new TypeError(`CycleWire: invalid on ${JSON.stringify(on)}`);
    }

    /** @type {Record<string, string>} */
    // An empty prefix means data-: a bare "action" is already a form attribute.
    const base = prefix || 'data-';
    const attributes = { [`${base}${on === undefined ? 'action' : `on-${on}`}`]: action };
    if (props != null) {
        const json = JSON.stringify(props);
        if (json === undefined) throw new TypeError('CycleWire: props must be something JSON can hold');
        attributes[`${base}props`] = json;
    }
    for (const name of ORDER) {
        const value = given[name];
        if (value === undefined) continue;
        if (!valid(name, value)) throw new TypeError(`CycleWire: invalid ${name} ${JSON.stringify(value)}`);
        attributes[`${base}${name}`] = value === true ? '' : String(value);
    }
    return attributes;
}

/**
 * The attributes as one string, escaped for HTML, to print inside a start tag:
 * cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}".
 * @param {string} action `module` or `module#export`
 * @param {unknown} [props] anything JSON.stringify() takes, or null for none
 * @param {Options} [options]
 * @returns {string}
 * @throws {TypeError} for a bad name, option or value
 */
export function cwAttrs(action, props = null, options = {}) {
    return Object.entries(cw(action, props, options))
        .map(([name, value]) => (value === '' ? name : `${name}="${escape(value)}"`))
        .join(' ');
}
```

In JSX, spread `cw()`. Its values are raw, since JSX escapes attributes itself:

```jsx
import { cw } from './cw.js';

export const AddToCart = ({ sku }) => <button {...cw('cart#add', { sku })}>Add to cart</button>;

export const Reviews = ({ product }) => <section {...cw('reviews#load', { product }, { trigger: 'visible' })} />;
```

The object spreads the same way in Vue (`v-bind="cw('cart#add', { sku })"`) and Svelte
(`{...cw('cart#add', { sku })}`).

In a template literal, use `cwAttrs()`, which escapes:

```js
import { cwAttrs } from './cw.js';

const button = `<button ${cwAttrs('cart#add', { sku })}>Add to cart</button>`;
const search = `<input type="search" ${cwAttrs('search#keys', null, { on: 'keydown' })}>`;
```

`html` from [`cyclewire/dom`](dom.md) is the exception: it refuses an interpolation where
attribute names go, and escapes quoted values itself, so write the attributes out there:
`` html`<button cw-action="cart#add" cw-props="${JSON.stringify({ sku })}">…</button>` ``.
