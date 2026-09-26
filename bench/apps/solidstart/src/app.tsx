import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import CartSummary from "~/components/CartSummary";

// The starter's app root: the router, the file routes, a metadata provider
// and a Suspense boundary around the page, with the shop's header and footer
// around every page. The cart in the header loads like route data, so it has
// a boundary of its own.
export default function App() {
  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>Wirestore</Title>
          <header class="top">
            <a class="brand" href="/">Wirestore</a>
            <Suspense>
              <CartSummary />
            </Suspense>
          </header>
          <Suspense>{props.children}</Suspense>
          <footer class="bottom"><p>Wirestore is a benchmark scenario. Nothing here is for sale.</p></footer>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
