/**
 * No quick view on the shop's own URL. A soft navigation keeps a slot's
 * current page when the new URL has none in it, so without this page a
 * quick view opened by a full page load would stay on screen after a
 * category link or a search moved on to /.
 */
export default function NoQuickView() {
    return null;
}
