<script setup>
// A Vue component with a CycleWire action inside it: "Save" is a plain
// data-cw-action, and its props are whatever Vue rendered last.
import { onMounted, ref } from 'vue';

const props = defineProps({ start: { type: Number, default: 0 } });
const count = ref(props.start);
const saved = ref(null);
const ready = ref(false);

onMounted(() => {
    ready.value = true;
});

// CycleWire reports an action's result with a cw:done event that bubbles up
// from the element the action is bound to.
function done(event) {
    if (event.detail.action === 'counter#save') saved.value = event.detail.result.count;
}
</script>

<template>
    <div class="counter" :data-ready="ready || undefined" @cw:done="done">
        <output class="counter__value">{{ count }}</output>
        <button type="button" class="counter__inc" @click="count++">+1</button>
        <button type="button" class="counter__save primary" data-cw-action="counter#save" :data-cw-props="JSON.stringify({ count })">Save</button>
        <p class="counter__status" role="status">{{ saved === null ? 'Not saved yet' : `Saved ${saved}` }}</p>
    </div>
</template>
