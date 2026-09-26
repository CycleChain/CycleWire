import { EventPhase } from '@angular/core/primitives/event-dispatch';

/**
 * Whether the browser has already carried out this event's default action,
 * such as sending a form or following a link.
 *
 * Angular can call a listener after the event has been dispatched: event
 * replay calls, once the page has hydrated, the listeners of events that
 * happened before (the event's phase is then EventPhase.REPLAY, and
 * preventDefault() throws), and incremental hydration calls those of an event
 * in a @defer block once the block has hydrated. Unless something prevented
 * the default action at the time (Angular does for a link in a dehydrated
 * block), the browser has done what it does without JavaScript: a form went
 * to the server, whose answer is a page that shows the result, so sending it
 * again here would send it twice.
 */
export function handledByBrowser(event: Event): boolean {
  return !event.defaultPrevented && (event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE);
}
