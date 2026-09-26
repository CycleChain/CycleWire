import { Title } from "@solidjs/meta";
import { HttpStatusCode } from "@solidjs/start";

// The starter's catch-all route, so that an unknown address answers 404.
export default function NotFound() {
  return (
    <main>
      <Title>Not Found</Title>
      <HttpStatusCode code={404} />
      <h1>Page not found</h1>
      <p>
        <a href="/">Back to the shop</a>
      </p>
    </main>
  );
}
