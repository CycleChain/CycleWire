<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CycleWire</title>
    @vite('resources/js/app.js')
    <style>
        :root { color-scheme: light dark; font: 16px/1.6 system-ui, sans-serif; }
        main { max-width: 36rem; margin: 3rem auto; padding: 0 1rem; display: grid; gap: 1rem; justify-items: start; }
        button, input { font: inherit; padding: .5rem .9rem; border-radius: .5rem; border: 1px solid #8884; }
        .like[aria-pressed="true"] { color: #be123c; border-color: currentColor; }
        input { width: 100%; }
    </style>
</head>
<body>
    <main>
        <h1>Hello, CycleWire</h1>
        <p>A Blade view: the actions in <code>resources/js/actions/</code> load when someone reaches for them.</p>

        <button type="button" class="like" data-cw-action="like" aria-pressed="false">
            ♥ Like <span class="like__count">12</span>
        </button>

        @php($tools = ['Vite', 'Astro', 'Laravel', 'Rails', 'Django'])
        <label for="search">Filter the list</label>
        <input id="search" type="search" autocomplete="off" data-cw-action="search" data-cw-debounce="100"
               data-cw-props='@json(['list' => 'tools'])'>
        <ul id="tools">
            @foreach ($tools as $tool)
                <li>{{ $tool }}</li>
            @endforeach
        </ul>
        <p id="tools-count" aria-live="polite">{{ count($tools) }} of {{ count($tools) }}</p>
    </main>
</body>
</html>
