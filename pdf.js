// Turns a finished book into PDFs: a reading copy to download, and the two files a printer
// needs (the interior pages, and the cover as one spread: back, spine, front).
// Every page is 11.25 x 8.75 in: an 11 x 8.5 in landscape book with 0.125 in bleed.
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import { PAGE_W, PAGE_H, SAFE, textBandHeight } from './layout.js';

const require = createRequire(import.meta.url);
const FONT = require.resolve('@fontsource/fredoka/files/fredoka-latin-600-normal.woff');
const FONT_REGULAR = require.resolve('@fontsource/fredoka/files/fredoka-latin-400-normal.woff');

export const PUBLISHER = process.env.PUBLISHER || 'Beanstalk Storybook';
export const INTERIOR_PAGES = 24; // The hardcover's minimum: copyright, 20 story pages, The End, 2 blank.
const CREAM = '#fbf6e9';
const INK = '#23311f';
const GREEN = '#3f8a3a';
const MUTED = '#66705f';
const SAFE_PT = SAFE * PAGE_H;

function newDoc(title, size = [PAGE_W, PAGE_H]) {
  return new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title, Author: PUBLISHER } });
}

// Full-bleed art, cropped to fill the area like CSS object-fit: cover.
function art(doc, image, x, y, w, h) {
  doc.save().rect(x, y, w, h).clip();
  doc.image(image, x, y, { cover: [w, h], align: 'center', valign: 'center' });
  doc.restore();
}

// White words on a soft dark gradient, inside a band the layout engine found clear.
function bandText(doc, text, layout, x, w) {
  const y0 = layout.y0 * PAGE_H;
  const y1 = layout.y1 * PAGE_H;
  const pad = 26;
  const top = Math.max(0, y0 - pad);
  const bottom = Math.min(PAGE_H, y1 + pad);
  if (layout.zone === 'middle') {
    doc.save().roundedRect(x + 40, top, w - 80, bottom - top, 18).fillOpacity(0.5).fill('#000').restore();
  } else {
    const grad = doc.linearGradient(0, top, 0, bottom);
    const dark = layout.zone === 'top';
    grad.stop(0, '#000', dark ? 0.6 : 0).stop(1, '#000', dark ? 0 : 0.6);
    doc.save().rect(x, top, w, bottom - top).fill(grad).restore();
  }
  const opts = { width: w - 120, align: 'center', lineGap: layout.fontSize * 0.28 };
  doc.font(FONT).fontSize(layout.fontSize);
  const h = doc.heightOfString(text, opts);
  const ty = (y0 + y1) / 2 - h / 2;
  doc.fillColor('#000').fillOpacity(0.45).text(text, x + 62, ty + 2, opts);
  doc.fillColor('#fff').fillOpacity(1).text(text, x + 60, ty, opts);
}

function storyPage(doc, page, x = 0, w = PAGE_W) {
  const layout = page.layout || { mode: 'panel', fontSize: 24 };
  if (layout.mode === 'band') {
    art(doc, page.image, x, 0, w, PAGE_H);
    bandText(doc, page.text, layout, x, w);
    return;
  }
  // Panel: the words get their own strip, so the picture is never covered.
  doc.rect(x, 0, w, PAGE_H).fill(CREAM);
  const textH = textBandHeight(page.text, layout.fontSize) * PAGE_H + 18;
  const artH = PAGE_H - textH - SAFE_PT;
  art(doc, page.image, x, 0, w, artH);
  doc.font(FONT).fontSize(layout.fontSize).fillColor(INK)
    .text(page.text, x + 60, artH + 14, { width: w - 120, align: 'center', lineGap: layout.fontSize * 0.28 });
}

function copyrightPage(doc, book) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM);
  const x = 140;
  const w = PAGE_W - 280;
  let y = 170;
  const line = (text, size, color = INK, font = FONT_REGULAR, gap = 10) => {
    doc.font(font).fontSize(size).fillColor(color).text(text, x, y, { width: w, align: 'center' });
    y = doc.y + gap;
  };
  line(book.title, 24, INK, FONT, 4);
  line(`starring ${book.name}`, 16, GREEN, FONT, 26);
  line(`Copyright © ${new Date(book.createdAt).getFullYear()} ${PUBLISHER}. All rights reserved.`, 12);
  line(`Published by ${PUBLISHER}, book.everchargeelectric.com`, 12, INK, FONT_REGULAR, 22);
  line(`Story retold from the traditional fairy tale. Pictures made for this edition with AI image tools, starring ${book.name}.`, 11, MUTED);
  line('No part of this book may be reproduced without the publisher’s permission.', 11, MUTED);
  line(`First edition. Book ${book.id.slice(0, 8)}.`, 11, MUTED);
}

function theEnd(doc) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM);
  doc.font(FONT).fontSize(54).fillColor(GREEN).text('The End', 0, PAGE_H / 2 - 36, { width: PAGE_W, align: 'center' });
}

function blank(doc) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#ffffff');
}

// The front cover: the cover picture, with the title where it covers nothing important.
function frontCover(doc, book, x, w, h, safe) {
  const page = book.pages[book.coverIndex];
  art(doc, page.image, x, 0, w, h);
  const zone = page.layout?.mode === 'band' && page.layout.zone === 'bottom' ? 'bottom' : 'top';
  const blockH = 150;
  const y0 = zone === 'top' ? safe : h - safe - blockH;
  const grad = doc.linearGradient(0, y0 - 40, 0, y0 + blockH + 40);
  grad.stop(0, '#000', zone === 'top' ? 0.65 : 0).stop(1, '#000', zone === 'top' ? 0 : 0.65);
  doc.save().rect(x, Math.max(0, y0 - 40), w, blockH + 80).fill(grad).restore();
  const opts = { width: w - 2 * safe - 40, align: 'center' };
  doc.font(FONT).fontSize(44).fillColor('#fff').text(book.title, x + safe + 20, y0 + 10, opts);
  doc.font(FONT).fontSize(24).fillColor('#ffe7a3').text(`starring ${book.name}`, x + safe + 20, doc.y + 4, opts);
}

// The back cover: About Me.
function backCover(doc, book, x, w, h, safe) {
  doc.rect(x, 0, w, h).fill(CREAM);
  const boxH = h - 2 * safe - 40;
  const boxW = boxH * 0.72;
  const bx = x + safe + 20;
  const by = safe + 20;
  if (book.hero) {
    // The sheet's left half is the full-body front view.
    doc.save().roundedRect(bx, by, boxW, boxH, 16).clip();
    doc.image(book.hero, bx, by, { height: boxH, width: boxH * 1.5 });
    doc.restore();
  }
  const tx = bx + boxW + 36;
  const tw = x + w - safe - 20 - tx;
  const about = book.about;
  doc.font(FONT).fontSize(20).fillColor(GREEN).text('About Me', tx, by + 10, { width: tw });
  doc.font(FONT).fontSize(40).fillColor(INK).text(book.name, tx, doc.y + 2, { width: tw });
  doc.font(FONT_REGULAR).fontSize(15).fillColor(MUTED).text(`starring as ${book.hero_name}`, tx, doc.y + 2, { width: tw });
  let y = doc.y + 18;
  for (const [label, value] of [['Age', about.age], ['Favorite things', about.favorites], ['About me', about.bio]]) {
    if (!value) continue;
    doc.font(FONT_REGULAR).fontSize(13).fillColor(MUTED).text(label, tx, y, { width: tw });
    doc.font(FONT).fontSize(17).fillColor(INK).text(value, tx, doc.y + 2, { width: tw, lineGap: 2 });
    y = doc.y + 14;
  }
  doc.font(FONT_REGULAR).fontSize(10).fillColor(MUTED).text(PUBLISHER, tx, h - safe - 30, { width: tw });
}

// book: { id, title, hero_name, name, about, createdAt, hero (Buffer), coverIndex, pages: [{ image, text, layout }] }
export function readingPdf(book) {
  const doc = newDoc(`${book.title}, starring ${book.name}`);
  doc.addPage();
  frontCover(doc, book, 0, PAGE_W, PAGE_H, SAFE_PT);
  doc.addPage();
  copyrightPage(doc, book);
  for (const page of book.pages) {
    doc.addPage();
    storyPage(doc, page);
  }
  doc.addPage();
  theEnd(doc);
  doc.addPage();
  backCover(doc, book, 0, PAGE_W, PAGE_H, SAFE_PT);
  doc.end();
  return doc;
}

export function interiorPdf(book) {
  const doc = newDoc(`${book.title}, starring ${book.name} (interior)`);
  doc.addPage();
  copyrightPage(doc, book);
  for (const page of book.pages) {
    doc.addPage();
    storyPage(doc, page);
  }
  doc.addPage();
  theEnd(doc);
  for (let n = 2 + book.pages.length; n < INTERIOR_PAGES; n++) {
    doc.addPage();
    blank(doc);
  }
  doc.end();
  return doc;
}

// dims: { width, height } in points from the printer's cover-dimensions API; spine in points.
export function coverPdf(book, dims, spine) {
  const doc = newDoc(`${book.title}, starring ${book.name} (cover)`, [dims.width, dims.height]);
  doc.addPage();
  const panel = (dims.width - spine) / 2;
  // A hardcover wraps around the boards, so keep everything well inside each panel.
  const safe = Math.max(SAFE_PT, (dims.height - PAGE_H) / 2 + SAFE_PT);
  backCover(doc, book, 0, panel, dims.height, safe);
  doc.rect(panel, 0, spine, dims.height).fill(GREEN);
  frontCover(doc, book, panel + spine, panel, dims.height, safe);
  doc.end();
  return doc;
}
