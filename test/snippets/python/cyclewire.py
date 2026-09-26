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
