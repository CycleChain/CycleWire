import { component$ } from "@builder.io/qwik";
import { QwikCityProvider, RouterOutlet } from "@builder.io/qwik-city";
import { RouterHead } from "./components/router-head/router-head";

export default component$(() => {
  /**
   * The root of a QwikCity site always start with the <QwikCityProvider> component,
   * immediately followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   *
   * The benchmark's shared stylesheet is linked as it is, in place of the starter's
   * bundled global.css, and nothing registers a service worker: since Qwik 1.14 the
   * preloader fetches code with <link rel="modulepreload">, and new apps have no
   * <ServiceWorkerRegister />.
   */

  return (
    <QwikCityProvider>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  );
});
