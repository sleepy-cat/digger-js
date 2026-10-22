// Emulation of the 16 colour 640x400 VGA screen the game draws on (sdl_vid.c).
// Coordinates are virtual: x in 0..319, y in 0..199, widths in units of
// 4 pixels. Each virtual pixel is 2x2 real ones.

import * as data from './data.js';

const WIDTH = 640;
const HEIGHT = 400;
export const CHR_W = 12;

const palettes = [
  [ // palette 1, normal intensity
    [0, 0, 0], [0, 0, 128], [0, 128, 0], [0, 128, 128], [128, 0, 0], [128, 0, 128],
    [128, 64, 0], [128, 128, 128], [64, 64, 64], [0, 0, 255], [0, 255, 0],
    [0, 255, 255], [255, 0, 0], [255, 0, 255], [255, 255, 0], [255, 255, 255],
  ],
  [ // palette 2, normal intensity
    [0, 0, 0], [0, 128, 0], [128, 0, 0], [128, 64, 0], [0, 0, 128], [0, 128, 128],
    [128, 0, 128], [128, 128, 128], [64, 64, 64], [0, 255, 0], [255, 0, 0],
    [255, 255, 0], [0, 0, 255], [0, 255, 255], [255, 0, 255], [255, 255, 255],
  ],
];

const intensePalettes = [
  [ // palette 1, high intensity
    [0, 0, 0], [0, 0, 255], [0, 255, 0], [0, 255, 255], [255, 0, 0], [255, 0, 255],
    [255, 128, 0], [196, 196, 196], [128, 128, 128], [128, 128, 255], [128, 255, 128],
    [128, 255, 255], [255, 128, 128], [255, 128, 255], [255, 255, 128], [255, 255, 255],
  ],
  [ // palette 2, high intensity
    [0, 0, 0], [0, 255, 0], [255, 0, 0], [255, 128, 0], [0, 0, 255], [0, 255, 255],
    [255, 0, 255], [196, 196, 196], [128, 128, 128], [128, 255, 128], [255, 128, 128],
    [255, 255, 128], [128, 128, 255], [128, 255, 255], [255, 128, 255], [255, 255, 255],
  ],
];

const pixels = new Uint8Array(WIDTH * HEIGHT);
const sprites = data.sprites.map(decode);
const font = data.font.map((s) => (s === null ? null : decode(s)));
let title = null;

let ctx = null;
let image = null;
let palette = palettes[0];
let currentPal = 0;

function decode(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function init(canvas) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d');
  image = ctx.createImageData(WIDTH, HEIGHT);
  const stream = new Blob([decode(data.title)]).stream()
    .pipeThrough(new DecompressionStream('deflate'));
  title = new Uint8Array(await new Response(stream).arrayBuffer());
}

// Shows the screen as it is now.
export function present() {
  if (ctx === null) return; // no browser, as in the tests
  const out = image.data;
  for (let i = 0, j = 0; i < pixels.length; i++, j += 4) {
    const c = palette[pixels[i] & 15];
    out[j] = c[0];
    out[j + 1] = c[1];
    out[j + 2] = c[2];
    out[j + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

export function clear() {
  pixels.fill(0);
}

export function pal(p) {
  palette = palettes[p];
  currentPal = p;
}

export function inten(i) {
  palette = i === 1 ? intensePalettes[currentPal] : palettes[currentPal];
}

// Copies a w x h block (w in units of 4 virtual pixels) from the screen.
export function geti(x, y, w, h) {
  const rw = w * 8, rh = h * 2, rx = x * 2, ry = y * 2;
  const buf = new Uint8Array(rw * rh);
  for (let j = 0; j < rh; j++) {
    const sy = ry + j;
    if (sy < 0 || sy >= HEIGHT) continue;
    for (let i = 0; i < rw; i++) {
      const sx = rx + i;
      if (sx >= 0 && sx < WIDTH) buf[j * rw + i] = pixels[sy * WIDTH + sx];
    }
  }
  return buf;
}

// Puts a block taken by geti() back onto the screen.
export function puti(x, y, buf, w, h) {
  if (buf === null) return;
  const rw = w * 8, rh = h * 2, rx = x * 2, ry = y * 2;
  for (let j = 0; j < rh; j++) {
    const sy = ry + j;
    if (sy < 0 || sy >= HEIGHT) continue;
    for (let i = 0; i < rw; i++) {
      const sx = rx + i;
      if (sx >= 0 && sx < WIDTH) pixels[sy * WIDTH + sx] = buf[j * rw + i];
    }
  }
}

// Draws sprite ch through its mask.
export function putim(x, y, ch, w, h) {
  const spr = sprites[ch * 2], mask = sprites[ch * 2 + 1];
  const rw = w * 8, rh = h * 2, rx = x * 2, ry = y * 2;
  for (let j = 0; j < rh; j++) {
    const sy = ry + j;
    if (sy < 0 || sy >= HEIGHT) continue;
    for (let i = 0; i < rw; i++) {
      const sx = rx + i;
      const k = j * rw + i;
      if (sx < 0 || sx >= WIDTH || k >= spr.length || spr[k] === 0xff) continue;
      const p = sy * WIDTH + sx;
      pixels[p] = (pixels[p] & mask[k]) | spr[k];
    }
  }
}

// Returns a bit for each of 8 real pixels starting at the virtual (x, y) that
// is not black: what the bullets use to find walls.
export function getpix(x, y) {
  if (x > 319 || y > 199) return 0xff;
  const base = y * 2 * WIDTH + x * 2;
  let r = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 8; i++) {
      if (pixels[base + j * WIDTH + i]) r |= 0x80 >> i;
    }
  }
  return r & 0xee;
}

export function isvalchar(ch) {
  const i = ch.charCodeAt(0) - 32;
  return i >= 0 && i < font.length && font[i] !== null;
}

// Writes character ch in colour c (1 green, 2 red, 3 yellow).
export function write(x, y, ch, c) {
  if (!isvalchar(ch)) return;
  const buf = font[ch.charCodeAt(0) - 32].map((color) => {
    if (color === 10) {
      if (c === 2) return 12;
      if (c === 3) return 14;
    } else if (color === 12) {
      if (c === 1) return 2;
      if (c === 2) return 4;
      if (c === 3) return 6;
    }
    return color;
  });
  puti(x, y, buf, 3, 12);
}

export function showTitle() {
  pixels.set(title);
}
