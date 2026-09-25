/**
 * The product data, for servers. Every stack reads the same file. It is a
 * JSON import, so bundlers that pull this module into a server build carry
 * the data along.
 */
import data from './products.json' with { type: 'json' };
import { CATEGORIES, cartSummary, matches } from './markup.js';

/** @type {Array<{ id: string, name: string, category: string, price: number, description: string, art: object }>} */
export const products = data;

export const product = (id) => products.find((candidate) => candidate.id === id) ?? null;

/** @param {{ q?: string, category?: string }} filters */
export const search = (filters) => products.filter((candidate) => matches(candidate, filters));

export const isCategory = (id) => CATEGORIES.some((category) => category.id === id);

/** @param {Record<string, number>} items */
export const summary = (items) => cartSummary(items, products);

/** The fields a product listing needs, without the description. */
export const listing = ({ id, name, category, price }) => ({ id, name, category, price });

/** A product without the image art parameters. */
export const detail = ({ art, ...rest }) => rest;
