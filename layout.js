// Where the words go on each page. The rule: words never cover a face or anything the page
// needs you to see. The vision check returns boxes around those things; this picks a band of
// the page (top, middle or bottom) that misses every box. If none does, the page switches to a
// "panel" layout: the picture shrinks and the words sit on their own strip below it, so nothing
// is ever covered.

// The printed page is 11.25 x 8.75 in (with bleed); the art is 3:2, so it's cropped at the sides.
export const PAGE_W = 810;
export const PAGE_H = 630;
const ART_ASPECT = 1.5;
const CROP_X = (1 - (PAGE_W / PAGE_H) / ART_ASPECT) / 2; // fraction of the art cut off each side
export const SAFE = 45 / PAGE_H; // 0.125 in bleed + 0.5 in safety margin, as a fraction of height
const MARGIN = 0.02;

const toPage = (b) => {
  const x = (b.x - CROP_X) / (1 - 2 * CROP_X);
  const w = b.w / (1 - 2 * CROP_X);
  return { label: b.label, x, y: b.y, w, h: b.h };
};

const overlaps = (band, boxes) => boxes.some((b) => b.y < band.y1 + MARGIN && b.y + b.h > band.y0 - MARGIN && b.x < 1 && b.x + b.w > 0);

// Rough height of the text block as a fraction of the page height, at a given font size in points.
export function textBandHeight(text, fontSize) {
  const charsPerLine = Math.floor((PAGE_W - 2 * 60) / (fontSize * 0.52));
  const lines = Math.ceil(text.length / charsPerLine) || 1;
  return (lines * fontSize * 1.28 + fontSize * 1.1) / PAGE_H;
}

// important: boxes in art fractions from the vision check. quiet: the template's preferred band.
export function placeText(text, important = [], quiet = 'bottom') {
  const boxes = important.map(toPage);
  const order = quiet === 'top' ? ['top', 'bottom', 'middle'] : ['bottom', 'top', 'middle'];
  for (const fontSize of [28, 23]) {
    const h = textBandHeight(text, fontSize);
    for (const zone of order) {
      const y0 = zone === 'top' ? SAFE : zone === 'bottom' ? 1 - SAFE - h : 0.5 - h / 2;
      const band = { y0, y1: y0 + h };
      if (!overlaps(band, boxes)) return { mode: 'band', zone, fontSize, y0: band.y0, y1: band.y1 };
    }
  }
  return { mode: 'panel', fontSize: 24 };
}

export const ART_CROP_X = CROP_X;
