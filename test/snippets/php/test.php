<?php

/**
 * Runs the shared cases in ../vectors.json against cw.php, then compiles and
 * runs a template with the Blade directive from AppServiceProvider.php, against
 * a stand-in for the two Laravel classes it uses. Plain PHP 8.1+, no Composer:
 *
 *   php test/snippets/php/test.php
 */

declare(strict_types=1);

namespace Illuminate\Support {
    abstract class ServiceProvider
    {
    }
}

namespace Illuminate\Support\Facades {
    // Records directives the way Blade does, so the test can call the compiler.
    class Blade
    {
        /** @var array<string, callable(string): string> */
        public static array $directives = [];

        public static function directive(string $name, callable $handler): void
        {
            self::$directives[$name] = $handler;
        }
    }
}

namespace {
    require __DIR__ . '/cw.php';
    require __DIR__ . '/AppServiceProvider.php';

    $failures = [];
    $check = function (string $name, bool $passed, string $expected, string $actual) use (&$failures): void {
        if (!$passed) {
            $failures[] = "$name\n  expected: $expected\n  actual:   $actual";
        }
    };

    // Maps decode as objects, since an empty PHP array would encode as a list.
    $vectors = json_decode((string) file_get_contents(__DIR__ . '/../vectors.json'), false, 512, JSON_THROW_ON_ERROR);
    foreach ($vectors->cases as $case) {
        $error = $case->error ?? false;
        try {
            $actual = \CycleWire\cw($case->action, $case->props, (array) $case->options);
        } catch (\Throwable $e) {
            $actual = $e;
        }
        $check(
            $case->name,
            $error ? $actual instanceof \InvalidArgumentException : $actual === $case->expected,
            $error ? 'InvalidArgumentException' : $case->expected,
            $actual instanceof \Throwable ? get_class($actual) . ': ' . $actual->getMessage() : $actual,
        );
    }

    // PHP values the vectors cannot express.
    $check('an empty array is a list', \CycleWire\cw('list', []) === 'cw-action="list" cw-props="[]"', '[]', \CycleWire\cw('list', []));
    $check('(object) [] is an empty map', \CycleWire\cw('map', (object) []) === 'cw-action="map" cw-props="{}"', '{}', \CycleWire\cw('map', (object) []));

    // Blade hands a directive its arguments as PHP source, then runs the PHP the
    // directive returns as part of the compiled template.
    (new \App\Providers\AppServiceProvider())->boot();
    $compiled = (\Illuminate\Support\Facades\Blade::$directives['cw'])("'cart#add', ['sku' => \$sku], ['trigger' => 'visible']");
    $sku = 'Say "hi" <3';
    ob_start();
    eval('?><button ' . $compiled . '>Add</button>');
    $html = (string) ob_get_clean();
    $expected = '<button cw-action="cart#add" cw-props="{&quot;sku&quot;:&quot;Say \&quot;hi\&quot; &lt;3&quot;}" cw-trigger="visible">Add</button>';
    $check('the Blade directive', $html === $expected, $expected, $html);

    $total = count($vectors->cases) + 3;
    if ($failures) {
        fwrite(STDERR, implode("\n\n", $failures) . "\n\n" . count($failures) . " of $total checks failed.\n");
        exit(1);
    }
    echo "$total checks passed: " . count($vectors->cases) . " shared cases, PHP arrays and the Blade directive.\n";
}
