# __PROJECT_NAME__

An [Astro](https://astro.build/) site whose pages are activated by
[CycleWire](https://cyclechain.github.io/CycleWire/) instead of hydrated islands.

```sh
npm install
npm run dev      # then press Alt+Shift+W for the devtools
npm run build
npm run check    # checks every cw-* value in src/**/*.astro against src/actions/
```

Each file in `src/actions/` is an action, named after its path (`src/actions/cart/add.js`
is `cart.add`), and its code loads when someone reaches for it. Astro components can
still hydrate where you want a framework: see
[frameworks](https://cyclechain.github.io/CycleWire/docs/frameworks/).

Learn more in the [documentation](https://cyclechain.github.io/CycleWire/docs/).
