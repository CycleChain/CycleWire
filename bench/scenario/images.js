/**
 * Product images: one 480×360 WebP per product, drawn from the art
 * parameters in products.json and given photographic grain, so their sizes
 * resemble real product photos rather than flat illustrations. They are
 * generated into .cache/images on first use and are the same bytes on every
 * machine that uses the same sharp version.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prng } from './random.js';
import { products } from './catalog.js';

export const IMAGES = fileURLToPath(new URL('../.cache/images/', import.meta.url));
const WIDTH = 480;
const HEIGHT = 360;
const QUALITY = 72;
const GRAIN = 22;
/** Bump when the drawing changes, so cached images are redrawn. */
const VERSION = 1;

const SHAPES = [
    // A tall object: a vase, a lamp, a bottle.
    (dark) => `<rect x="190" y="70" width="100" height="210" rx="42" fill="url(#body)"/><rect x="226" y="52" width="28" height="30" rx="8" fill="${dark}"/>`,
    // A round object: a bowl, a speaker, a planter.
    () => `<circle cx="240" cy="190" r="98" fill="url(#body)"/><circle cx="240" cy="190" r="46" fill="#000" opacity=".12"/>`,
    // A wide object: a table, a bench, a tray.
    (dark) => `<rect x="96" y="128" width="288" height="56" rx="16" fill="url(#body)"/><rect x="124" y="176" width="22" height="104" rx="8" fill="${dark}"/><rect x="334" y="176" width="22" height="104" rx="8" fill="${dark}"/>`,
    // A shade over a stem.
    (dark) => `<path d="M168 170 L240 64 L312 170 Z" fill="url(#body)"/><rect x="232" y="166" width="16" height="96" fill="${dark}"/><rect x="196" y="258" width="88" height="16" rx="8" fill="${dark}"/>`,
];

function svg({ colors: [light, dark], shape, light: [lx, ly] }) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}" stop-opacity=".45"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}" stop-opacity=".78"/><stop offset="1" stop-color="${dark}"/></linearGradient>
<radialGradient id="glow" cx="${lx}" cy="${ly}" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${light}"/>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
<rect y="262" width="${WIDTH}" height="98" fill="#000" opacity=".06"/>
<ellipse cx="240" cy="284" rx="150" ry="16" fill="#000" opacity=".18"/>
${SHAPES[shape](dark)}
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
</svg>`;
}

/** @param {import('sharp').default} sharp */
async function draw(sharp, art) {
    const { data, info } = await sharp(Buffer.from(svg(art))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const random = prng(art.seed);
    for (let i = 0; i < data.length; i += info.channels) {
        const noise = (random() - 0.5) * GRAIN;
        for (let c = 0; c < info.channels; c++) data[i + c] = Math.max(0, Math.min(255, data[i + c] + noise));
    }
    return sharp(data, { raw: info }).webp({ quality: QUALITY, effort: 4 }).toBuffer();
}

/** A fingerprint of everything the images depend on. */
async function fingerprint(sharp) {
    return createHash('sha256').update(JSON.stringify({ VERSION, WIDTH, HEIGHT, QUALITY, GRAIN, sharp: sharp.versions, art: products.map((p) => p.art) })).digest('hex');
}

/** Draws the images unless .cache/images already holds this exact set. */
export async function ensureImages({ log = console.log } = {}) {
    const { default: sharp } = await import('sharp');
    const stamp = join(IMAGES, 'stamp.txt');
    const expected = await fingerprint(sharp);
    if ((await readFile(stamp, 'utf8').catch(() => '')) === expected) return IMAGES;
    await mkdir(IMAGES, { recursive: true });
    let bytes = 0;
    for (const product of products) {
        const image = await draw(sharp, product.art);
        bytes += image.length;
        await writeFile(join(IMAGES, `${product.id}.webp`), image);
    }
    await writeFile(stamp, expected);
    log(`Drew ${products.length} product images (${Math.round(bytes / 1024)} KiB) into ${IMAGES}`);
    return IMAGES;
}
