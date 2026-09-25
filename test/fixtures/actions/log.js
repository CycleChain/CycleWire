// Records each call so specs can assert exactly what ran, and with what.
const entry = (fn, ctx, extra = {}) => ({
    fn,
    el: ctx.element.id || ctx.element.localName,
    type: ctx.event ? ctx.event.type : null,
    target: ctx.target && ctx.target.id ? ctx.target.id : null,
    ...extra,
});

export function run(ctx) {
    window.__log.push(entry('run', ctx, { props: ctx.props }));
    return 'ran';
}

export function second(ctx) {
    window.__log.push(entry('second', ctx));
}

export function context(ctx) {
    window.__log.push({ fn: 'context', keys: Object.keys(ctx).sort(), aborted: ctx.signal.aborted, isWire: typeof ctx.wire.run === 'function' });
}

export function submitter(ctx) {
    window.__log.push(entry('submitter', ctx, { submitter: ctx.event && ctx.event.submitter ? ctx.event.submitter.id : null }));
}

export function command(ctx) {
    window.__log.push(entry('command', ctx, { command: ctx.event.command, source: ctx.event.source ? ctx.event.source.id : null }));
}

export function value(ctx) {
    window.__log.push(entry('value', ctx, { value: ctx.element.value }));
}

export function boom() {
    throw new Error('boom');
}

// Positional parameters: the development build warns about this signature.
export function positional(event, element) {
    window.__log.push({ fn: 'positional', event: typeof event, element: typeof element });
}
