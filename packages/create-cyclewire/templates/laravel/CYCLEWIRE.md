# CycleWire in this Laravel app

The files are in place: two actions in `resources/js/actions/` and a demo view,
`resources/views/cyclewire.blade.php`. Four steps wire them up.

1. Install CycleWire:

   ```sh
   npm install cyclewire
   ```

2. In `vite.config.js`, add the plugin next to Laravel's. Every file in
   `resources/js/actions/` becomes an action, loaded when someone reaches for it:

   ```js
   import cyclewire from 'cyclewire/vite';

   export default defineConfig({
       plugins: [
           laravel({ input: ['resources/css/app.css', 'resources/js/app.js'], refresh: true }),
           cyclewire({ actions: 'resources/js/actions', devtools: true }),
       ],
   });
   ```

3. In `resources/js/app.js`, start CycleWire:

   ```js
   import { start } from 'cyclewire';
   import actions from 'virtual:cyclewire/actions';

   start({ actions });
   ```

4. In `routes/web.php`, add a route to the demo:

   ```php
   Route::view('/cyclewire', 'cyclewire');
   ```

Then run `npm run dev` and `php artisan serve`, and open `/cyclewire`. Press Alt+Shift+W
for the devtools.

Check every `cw-*` value in your views against your actions, in CI too:

```sh
npx cyclewire check --actions resources/js/actions --templates "resources/views/**/*.blade.php"
```

To write the attributes with a Blade directive (`<button @cw('cart#add', ['sku' => $sku])>`),
add the helper from the [server helpers guide](https://cyclechain.github.io/CycleWire/docs/server-helpers/).
Learn more in the [documentation](https://cyclechain.github.io/CycleWire/docs/).
