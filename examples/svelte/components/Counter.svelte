<script>
    // A Svelte component with a CycleWire action inside it: "Save" is a plain
    // data-cw-action, and its props are whatever Svelte rendered last.
    import { onMount, untrack } from 'svelte';
    import { on } from 'svelte/events';

    let { start = 0 } = $props();
    // The count starts at the prop's value; later changes to the prop are ignored.
    let count = $state(untrack(() => start));
    let saved = $state(null);
    let ready = $state(false);

    onMount(() => {
        ready = true;
    });

    // CycleWire reports an action's result with a cw:done event that bubbles
    // up from the element the action is bound to.
    function listen(node) {
        return on(node, 'cw:done', (event) => {
            if (event.detail.action === 'counter#save') saved = event.detail.result.count;
        });
    }
</script>

<div class="counter" data-ready={ready || undefined} {@attach listen}>
    <output class="counter__value">{count}</output>
    <button type="button" class="counter__inc" onclick={() => count++}>+1</button>
    <button type="button" class="counter__save primary" data-cw-action="counter#save" data-cw-props={JSON.stringify({ count })}>Save</button>
    <p class="counter__status" role="status">{saved === null ? 'Not saved yet' : `Saved ${saved}`}</p>
</div>
