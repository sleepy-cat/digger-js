// Keyboard (input.c, sdl_kbd.c).

import { dg, DIR_NONE, DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN, DIGGERS } from './state.js';
import * as snd from './sound.js';
import { playgetdir, recputdir } from './record.js';
import * as edrf from './edrf.js';

// The controls of each Digger.
const controls = [
  {
    right: ['ArrowRight'], up: ['ArrowUp'], left: ['ArrowLeft'], down: ['ArrowDown'],
    fire: ['F1', 'ControlLeft', 'ControlRight', 'Enter'],
  },
  {
    right: ['KeyS'], up: ['KeyW'], left: ['KeyA'], down: ['KeyZ'], fire: ['Tab'],
  },
];

// Keys that do something else than control a Digger.
const commands = {
  NumpadAdd: 'faster', Equal: 'faster',
  NumpadSubtract: 'slower', Minus: 'slower',
  F7: 'music',
  F9: 'sound',
  F10: 'exit', Escape: 'exit',
  Space: 'pause',
  KeyN: 'mode',
  F8: 'save', // see app.js
};

const held = new Set();
const keybuf = [];

// Per Digger: keys pressed since the last look, so that a short press
// between two frames isn't missed.
const tapped = Array.from({ length: DIGGERS }, () => new Set());

export const flags = { pause: false, modechange: false, start: false };

// The state of the directions, see readdirect().
const dirs = Array.from({ length: DIGGERS }, () => ({
  dynamic: DIR_NONE, static: DIR_NONE, key: DIR_NONE,
  old: { up: false, down: false, left: false, right: false },
  fire: false, fireactive: false,
}));

export function init() {
  window.addEventListener('keydown', (e) => {
    snd.resume(); // browsers only let sound start on a key press
    if (e.code in commands || controls.some((c) => Object.values(c).flat().includes(e.code))) {
      e.preventDefault();
    }
    if (e.repeat) return;
    held.add(e.code);
    controls.forEach((c, n) => {
      for (const action of Object.keys(c)) {
        if (c[action].includes(e.code)) tapped[n].add(action);
      }
    });
    keybuf.push({ code: e.code, key: e.key });
    command(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
}

function command(code) {
  switch (commands[code]) {
    case 'faster':
      if (dg.ftime > 10) dg.ftime -= 10;
      break;
    case 'slower':
      dg.ftime += 10;
      break;
    case 'music':
      snd.togglemusic();
      break;
    case 'sound':
      snd.togglesound();
      break;
    case 'exit':
      dg.escape = true;
      break;
    case 'pause':
      flags.pause = true;
      break;
    case 'mode':
      flags.modechange = true;
      break;
    case 'save':
      return; // without starting a game
  }
  if (!flags.modechange) flags.start = true;
}

export function kbhit() {
  return keybuf.length > 0;
}

export function getkey() {
  return keybuf.shift();
}

export async function waitkey() {
  while (!kbhit()) await new Promise((resolve) => setTimeout(resolve, 20));
  return getkey();
}

// Drops the keys typed so far, as their commands are done already.
export function drainkeys() {
  keybuf.length = 0;
}

export function flushkeybuf() {
  keybuf.length = 0;
  for (const t of tapped) t.clear();
}

function pressed(n, action) {
  if (dg.playing) return false; // the recording has the controls
  const was = tapped[n].delete(action);
  return was || controls[n][action].some((code) => held.has(code));
}

export function teststart() {
  const s = flags.start;
  flags.start = false;
  return s;
}

export function resetdirections() {
  for (const d of dirs) {
    d.dynamic = d.static = d.key = DIR_NONE;
    d.old = { up: false, down: false, left: false, right: false };
    d.fire = d.fireactive = false;
  }
}

// The fire button as of the frame before, see newframe().
export function advancefire() {
  for (const d of dirs) d.fireactive = d.fire;
}

// Reads the controls of Digger n: the last direction pressed wins, and
// when it's let go the one still held, if any.
export function readdirect(n) {
  const d = dirs[n];
  let bits = 0;
  if (pressed(n, 'up')) bits |= edrf.CTRL_UP;
  if (pressed(n, 'down')) bits |= edrf.CTRL_DOWN;
  if (pressed(n, 'left')) bits |= edrf.CTRL_LEFT;
  if (pressed(n, 'right')) bits |= edrf.CTRL_RIGHT;
  if (pressed(n, 'fire')) bits |= edrf.CTRL_FIRE;
  bits = edrf.input(n, bits); // recorded, or as recorded when played back
  const u = (bits & edrf.CTRL_UP) !== 0;
  const dn = (bits & edrf.CTRL_DOWN) !== 0;
  const l = (bits & edrf.CTRL_LEFT) !== 0;
  const r = (bits & edrf.CTRL_RIGHT) !== 0;
  d.fire = (bits & edrf.CTRL_FIRE) !== 0;
  if (u && !d.old.up) d.static = d.dynamic = DIR_UP;
  if (dn && !d.old.down) d.static = d.dynamic = DIR_DOWN;
  if (l && !d.old.left) d.static = d.dynamic = DIR_LEFT;
  if (r && !d.old.right) d.static = d.dynamic = DIR_RIGHT;
  if ((d.old.up && !u && d.dynamic === DIR_UP) ||
      (d.old.down && !dn && d.dynamic === DIR_DOWN) ||
      (d.old.left && !l && d.dynamic === DIR_LEFT) ||
      (d.old.right && !r && d.dynamic === DIR_RIGHT)) {
    d.dynamic = DIR_NONE;
    if (u) d.dynamic = d.static = DIR_UP;
    if (dn) d.dynamic = d.static = DIR_DOWN;
    if (l) d.dynamic = d.static = DIR_LEFT;
    if (r) d.dynamic = d.static = DIR_RIGHT;
  }
  d.old = { up: u, down: dn, left: l, right: r };
  d.key = d.dynamic !== DIR_NONE ? d.dynamic : d.static;
  d.static = DIR_NONE;
}

// The direction Digger n goes in: as pressed, or as recorded.
export function getdirect(n) {
  const d = dirs[n];
  let dir = d.key;
  if (dg.playing && !dg.edrfplaying) {
    const rec = playgetdir();
    if (rec !== null) {
      d.fire = rec.fire;
      if (rec.dir !== undefined) dir = rec.dir;
    }
  }
  recputdir(dir, d.fire);
  edrf.movement(n, dir, d.fire);
  return dir;
}

export function getfire(n) {
  return dirs[n].fireactive;
}

export function clearfire(n) {
  tapped[n].delete('fire');
}
