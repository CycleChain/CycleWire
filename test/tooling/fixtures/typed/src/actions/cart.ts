import { defineAction } from 'cyclewire';

export const add = defineAction<{ sku: string; quantity?: number }>(({ props }) => props.sku);

export function clear() {}
