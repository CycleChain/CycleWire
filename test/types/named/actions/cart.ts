import { defineAction } from 'cyclewire';

export const add = defineAction<{ sku: string; quantity?: number }, HTMLFormElement>(({ props, element, signal }) => {
    props.sku.toUpperCase();
    element.requestSubmit();
    signal.throwIfAborted();
    // @ts-expect-error: not in the props type
    props.colour;
});

export const clear = defineAction(({ props }) => props);
