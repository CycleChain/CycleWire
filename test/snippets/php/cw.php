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
 * data-cw-action="cart#add" data-cw-props="{&quot;sku&quot;:&quot;wire-01&quot;}" data-cw-trigger="visible"
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

    $attributes = ["data-$prefix" . ($on === null ? 'action' : "on-$on") => $action];
    if ($props !== null) {
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;
        $attributes["data-{$prefix}props"] = json_encode($props, $flags);
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
        $attributes["data-$prefix$name"] = $value === true ? null : (string) $value;
    }

    $escapes = ['&' => '&amp;', '"' => '&quot;', "'" => '&#39;', '<' => '&lt;', '>' => '&gt;'];
    $html = [];
    foreach ($attributes as $name => $value) {
        $html[] = $value === null ? $name : $name . '="' . strtr($value, $escapes) . '"';
    }
    return implode(' ', $html);
}
