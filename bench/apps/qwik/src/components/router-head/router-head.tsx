import { component$ } from "@builder.io/qwik";
import { useDocumentHead } from "@builder.io/qwik-city";

/**
 * The RouterHead component is placed inside of the document `<head>` element.
 * It renders what the route's `head` export declares. The starter's canonical
 * link and favicon are left out: the page has neither.
 */
export const RouterHead = component$(() => {
  const head = useDocumentHead();

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{head.title}</title>

      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}

      {head.links.map((l) => (
        <link key={l.key} {...l} />
      ))}
    </>
  );
});
