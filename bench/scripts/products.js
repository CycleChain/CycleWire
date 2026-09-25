#!/usr/bin/env node
/**
 * Writes scenario/products.json: the 50 products every stack renders. The
 * names are fixed; prices, descriptions, the art of each image and the order
 * come from a seeded generator, so running this again produces the same file.
 * The file is committed. Change it only together with scenario/golden.json
 * (`npm run golden`), since every stack is checked against both.
 *
 *   node scripts/products.js
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES } from '../scenario/markup.js';
import { prng, shuffle } from '../scenario/random.js';

const NAMES = {
    lighting: ['Walnut Desk Lamp', 'Linen Floor Lamp', 'Ceramic Table Lamp', 'Steel Clip Lamp', 'Rattan Pendant Light', 'Brass Wall Sconce', 'Copper Lantern', 'Paper String Lights'],
    furniture: ['Oak Side Table', 'Cane Lounge Chair', 'Ash Bookshelf', 'Walnut Stool', 'Pine Bench', 'Birch Coffee Table', 'Steel Plant Stand'],
    kitchen: ["Steel Chef's Knife", 'Olive Wood Cutting Board', 'Stoneware Teapot', 'Glass Pour-Over Set', 'Enamel Mixing Bowl', 'Cast Iron Frying Pan', 'Acacia Salad Servers'],
    textiles: ['Lambswool Throw', 'Velvet Cushion Cover', 'Linen Table Runner', 'Waffle Bath Towel', 'Cotton Duvet Cover', 'Jute Rug', 'Canvas Apron'],
    stationery: ['Kraft Notebook', 'Brass Fountain Pen', 'Cork Desk Organizer', 'Leather Planner', 'Cedar Pencil Set', 'Bamboo Letter Tray', 'Linen Sketchbook'],
    audio: ['Walnut Speaker', 'Aluminium Headphones', 'Oak Turntable', 'Pocket Radio', 'Wireless Earbuds', 'Maple Soundbar', 'Birch Record Crate'],
    garden: ['Galvanized Watering Can', 'Terracotta Planter', 'Steel Pruning Shears', 'Leather Garden Gloves', 'Cedar Bird Feeder', 'Zinc Hose Reel', 'Copper Trowel'],
};

const FEATURES = {
    lighting: ['a weighted base and a warm, dimmable glow', 'a linen shade that softens the light', 'an arm that reaches across a desk', 'a braided cloth cord and an inline switch', 'a frosted diffuser with no glare', 'a solid stem that patinas over time'],
    furniture: ['solid joinery and a hand-rubbed oil finish', 'a low profile that suits small rooms', 'rounded edges and a scratch-resistant top', 'feet that level themselves on uneven floors', 'a woven seat that gives a little', 'a hidden shelf for the things you reach for'],
    kitchen: ['a full-tang blade forged from one bar of steel', 'a groove that keeps juices off the counter', 'a double wall that keeps tea hot for an hour', 'a glaze that can go in the dishwasher', 'a seasoned surface that only gets better', 'sizes that nest in one cupboard'],
    textiles: ['yarn spun and dyed in small batches', 'a stonewashed finish that is soft from day one', 'a loose weave that breathes in summer', 'hidden zips and generous seams', 'fibres that soften with every wash', 'colours that hold after many washes'],
    stationery: ['lay-flat binding and heavy paper', 'a steel nib that writes wet and smooth', 'compartments sized for what you actually use', 'dotted pages for lists and sketches', 'barrels that sharpen cleanly', 'enough weight to keep papers in place'],
    audio: ['a warm, room-filling sound for its size', 'twenty hours of playback on one charge', 'a belt drive that keeps the speed steady', 'physical dials instead of menus', 'a fabric grille in three colours', 'pairing that remembers four devices'],
    garden: ['a long spout that reaches the back of a border', 'drainage holes and a matching saucer', 'blades that stay sharp through a season', 'a grip that stays dry in the rain', 'a roof that keeps the seed dry', 'a coated frame that will not rust'],
};

const CLOSINGS = [
    'Made in a small workshop and checked by hand.',
    'Ships in recycled packaging.',
    'Backed by a five-year guarantee.',
    'Arrives ready to use.',
    'Designed to be repaired, not replaced.',
    'Each piece varies slightly.',
];

/** Price ranges in cents. */
const PRICES = {
    lighting: [3900, 18900], furniture: [5900, 42900], kitchen: [1400, 12900], textiles: [1900, 15900],
    stationery: [600, 8900], audio: [2900, 34900], garden: [900, 7900],
};

/** Two colours per category for the product art. */
const PALETTES = {
    lighting: ['#f4d9a8', '#c9853f'], furniture: ['#d9c3a5', '#7a5534'], kitchen: ['#e3e7df', '#5f7d6a'], textiles: ['#ead6d0', '#a45d52'],
    stationery: ['#dfe3ec', '#3f5376'], audio: ['#d8d8d8', '#2f3440'], garden: ['#dbe7c9', '#557a35'],
};

export function generate(seed = 2026) {
    const random = prng(seed);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const all = [];
    for (const { id: category } of CATEGORIES) {
        for (const name of NAMES[category]) {
            const [low, high] = PRICES[category];
            const price = Math.round((low + random() * (high - low)) / 50) * 50;
            const noun = name.toLowerCase();
            const article = /^[aeiou]/.test(noun) ? 'An' : 'A';
            all.push({
                name,
                category,
                price,
                description: `${article} ${noun} with ${pick(FEATURES[category])}. ${pick(CLOSINGS)}`,
                art: { colors: PALETTES[category], shape: Math.floor(random() * 4), light: [Math.round(random() * 100) / 100, Math.round(random() * 60) / 100], seed: Math.floor(random() * 1e6) },
            });
        }
    }
    // Shuffled, so the first rows mix categories.
    return shuffle(all, random).map((product, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, ...product }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const products = generate();
    const out = fileURLToPath(new URL('../scenario/products.json', import.meta.url));
    await writeFile(out, `${JSON.stringify(products, null, 2)}\n`);
    console.log(`Wrote ${products.length} products to ${out}`);
}
