# Streams: `cyclewire/stream`

The server changes the page with small HTML messages, sent over
[Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) as
things happen, or in the body of any response. 3.3 kB brotli, with `dom` and `morph`.

```html
<cw-stream op="append" target="messages">
    <template><li>Ada: hello</li></template>
</cw-stream>
```

```js
import { apply, connect } from 'cyclewire/stream';

connect('/rooms/42/events');                   // applies every message the stream sends
await apply(html.raw(await response.text())); // applies the messages in a response
```

## Messages

A message names what to change and how; its `<template>` holds the new content.

| Attribute | |
| --- | --- |
| `op` | `append`, `prepend`, `before`, `after`, `inner` (replace the children), `outer` (replace the element), `morph` or `remove` |
| `target` | The id of the element to change |
| `targets` | A selector: every match is changed |
| `transition` | Run the change inside a View Transition where supported |

`morph` updates the target with [`morph()`](morph.md), so focus and typed-in values
survive. When the template holds new markup for the target itself (one element with the
target's id), the target is morphed onto it; otherwise the template becomes its children.

The template is parsed inertly: `<script>` elements in it never run, and images load only
once the content is in the page. Several messages can follow one another; they are applied
in order.

`<cw-stream>` is not a custom element. Markup that reaches the page any other way, from
user content say, does nothing: only `apply()` and `connect()` apply messages.

Each message dispatches a cancelable `cw:stream` event on its first target, with
`{ op, targets, content, source }` in `detail`. Cancel it to skip the message, or change
`detail.content` (a `DocumentFragment`) before it goes in:

```js
document.addEventListener('cw:stream', (event) => {
    if (event.detail.op === 'remove' && !confirm('Remove it?')) event.preventDefault();
});
```

## `connect(url, options?)`

Opens an `EventSource`, or joins the one already open for the same URL, and applies every
message it sends. Send messages as the default event (no `event:` field), and give them an
`id`: a reconnection then says where the stream left off.

| Option | |
| --- | --- |
| `signal` | An `AbortSignal` that closes this subscription |
| `element` | Closes the subscription when the element leaves the page, and shows the connection's state in its `data-cw-stream-state`: `connecting`, `open` or `closed` |
| `root` | Where targets are looked up: the document, or a shadow root |
| `withCredentials` | Send cookies to another origin |

It returns a function that closes the subscription. The connection itself closes with its
last subscriber.

- **Reconnection.** After a dropped connection the browser reconnects by itself and sends
  the last event id in a `Last-Event-ID` header. When the server answers with an error the
  browser gives up; CycleWire then reconnects on its own after 1 s, 2 s, 4 s… up to 30 s,
  and passes the last id as a `last-event-id` query parameter.
- **Back/forward cache.** Open connections keep a page out of it, so they are closed when
  the page is hidden into the cache and reopened when it comes back.
- **Prerendering.** A page prerendered by speculation rules opens nothing until it is
  shown.

```css
[data-cw-stream-state="connecting"]::after { content: " reconnecting…"; color: gray; }
```

## Streams from markup: `streams()`

```js
import { start } from 'cyclewire';
import { streams } from 'cyclewire/stream';

start({
    actions,
    plugins: [streams({
        channels: {
            notifications: '/notifications/events',
            room: (element) => `/rooms/${element.dataset.room}/events`,
        },
    })],
});
```

```html
<ul id="messages" data-cw-stream="room" data-room="42"></ul>
```

While an element with `data-cw-stream` is in the page, it is subscribed to its channel's
stream, and removing it unsubscribes it. Markup names channels, never URLs, and a channel
must lead to the page's own origin: like the action registry, the plugin decides which
streams markup can open. Nothing inside `data-cw-ignore` opens one.

With the full classic-script build, list the channels in the JSON configuration:
`"streams": { "channels": { "room": "/rooms/42/events" } }`.

## Messages in responses

A form handler can answer with the same messages, so one server-side template serves the
stream and the response:

```js
// actions/message.js
import { html } from 'cyclewire/dom';
import { apply } from 'cyclewire/stream';

export async function send({ element, signal }) {
    const response = await fetch(element.action, { method: 'POST', body: new FormData(element), signal });
    await apply(html.raw(await response.text()));
    element.reset();
}
```

`apply()` takes only markup marked with `html.raw()`: plain strings are refused, so text
from anywhere else can never be applied as HTML by mistake.

## On the server

A message is one event; each line of its HTML goes in its own `data:` field. Escape
anything that users wrote, as in any other HTML your server renders.

### Node

```js
import { createServer } from 'node:http';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const event = (id, markup) => `id: ${id}\n${markup.split('\n').map((line) => `data: ${line}`).join('\n')}\n\n`;

createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/rooms/42/events') return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    let id = Number(req.headers['last-event-id'] ?? url.searchParams.get('last-event-id') ?? 0);
    const timer = setInterval(() => {
        id++;
        res.write(event(id, `<cw-stream op="append" target="messages"><template><li>${escape(`Message ${id}`)}</li></template></cw-stream>`));
    }, 5000);
    req.on('close', () => clearInterval(timer));
}).listen(3000);
```

### PHP and Laravel

```php
use Symfony\Component\HttpFoundation\StreamedResponse;

Route::get('/rooms/{room}/events', function (Room $room) {
    return new StreamedResponse(function () use ($room) {
        $last = (int) (request()->header('Last-Event-ID') ?? request('last-event-id', 0));
        while (! connection_aborted()) {
            foreach ($room->messages()->where('id', '>', $last)->get() as $message) {
                $html = view('messages.stream', ['message' => $message])->render(); // <cw-stream op="append" …>
                echo "id: {$message->id}\n", preg_replace('/^/m', 'data: ', $html), "\n\n";
                $last = $message->id;
            }
            ob_flush();
            flush();
            sleep(2);
        }
    }, 200, ['Content-Type' => 'text/event-stream', 'Cache-Control' => 'no-store', 'X-Accel-Buffering' => 'no']);
});
```

Each open stream holds a PHP worker for as long as it lasts; give streams their own pool,
or use a server built for long-lived connections.

### Rails

```ruby
class RoomEventsController < ApplicationController
  include ActionController::Live

  def show
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-store'
    sse = SSE.new(response.stream, retry: 3000)
    last = (request.headers['Last-Event-ID'] || params['last-event-id']).to_i
    loop do
      Message.where(room_id: params[:id]).where('id > ?', last).find_each do |message|
        sse.write(render_to_string(partial: 'messages/stream', locals: { message: message }), id: message.id)
        last = message.id
      end
      sleep 2
    end
  rescue ActionController::Live::ClientDisconnected
  ensure
    sse&.close
  end
end
```

`SSE#write` splits the HTML into `data:` lines itself.

### Django

```python
import time
from django.http import StreamingHttpResponse
from django.template.loader import render_to_string

def room_events(request, room_id):
    last = int(request.headers.get('Last-Event-ID') or request.GET.get('last-event-id') or 0)

    def events():
        nonlocal last
        while True:
            for message in Message.objects.filter(room_id=room_id, id__gt=last):
                html = render_to_string('messages/stream.html', {'message': message})
                data = '\n'.join(f'data: {line}' for line in html.splitlines())
                yield f'id: {message.id}\n{data}\n\n'
                last = message.id
            time.sleep(2)

    return StreamingHttpResponse(events(), content_type='text/event-stream', headers={'Cache-Control': 'no-store'})
```

Under WSGI, each open stream holds a worker thread; serve streams with ASGI (and an async
generator) when there are many of them.

## Security

- Messages are HTML your server wrote, applied as it is, like `html.raw()`: escape what
  users wrote. `<script>` elements never run, but other HTML behaves as HTML does, so a
  Content Security Policy is as useful here as anywhere.
- Markup can only open the channels `streams()` lists, and only on the page's origin.
  `connect()` in your own code can open any URL; the stream's content is then as trusted
  as that origin.
- The parsed content goes through the page's Trusted Types policy, as in
  [`cyclewire/dom`](dom.md) (allow it with `trusted-types cyclewire`).
