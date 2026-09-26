# __PROJECT_NAME__

A plain HTML page activated by [CycleWire](https://cyclechain.github.io/CycleWire/), with
no build step: an import map loads CycleWire from jsDelivr, and each action is a file in
`actions/`, loaded when someone reaches for it.

```sh
npm start        # serves this folder at http://localhost:3000/
```

To add an action, write `actions/name.js` with an exported `run` function, list it in the
`start()` call in `index.html`, and put `cw-action="name"` on an element.

Learn more in the [documentation](https://cyclechain.github.io/CycleWire/docs/).
