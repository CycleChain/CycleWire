# __PROJECT_NAME__

A server-rendered page activated by [CycleWire](https://cyclechain.github.io/CycleWire/).

```sh
npm install
npm run dev      # then press Alt+Shift+W for the devtools
npm run build
npm run check    # checks every data-cw-* value against src/actions/
```

- Each file in `src/actions/` is an action: `src/actions/like.js` is `data-cw-action="like"`,
  `src/actions/cart/add.js` is `cart.add`. Its code loads when someone reaches for it.
- Edit an action while `npm run dev` runs: the next click runs the new code, and the page
  keeps its state.
- `src/cyclewire-actions.d.ts` is written for you, so your editor knows the action names.

Learn more in the [documentation](https://cyclechain.github.io/CycleWire/docs/).
