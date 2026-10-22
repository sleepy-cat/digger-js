// Network games: two players, each in their own browser, with a Digger
// each on the same field. The server (rooms.go) pairs them up, then passes
// on what each sends. The game runs in both browsers in step: on every frame
// each sends the keys pressed and waits for those of the other, and as the
// game goes the same way for the same keys, it goes the same in both.
//
// The keys pressed on a frame count DELAY frames later, so that they can get
// to the other player meanwhile, and the game needn't wait for them. So does
// Escape: both leave the game on the same frame.

import { dg } from './state.js';

const DELAY = 2;
const HASH_EVERY = 256; // ticks between the checks that both games are the same

export const net = {
  me: 0, // the player of this browser: 0 or 1, the slot of its Digger
  seed: 0, // of the random numbers of the game, the same for both
  quitter: -1, // the player who left the game with Escape, -1 for none
};

let ws = null;
let lockstep = false; // waiting for the other player on each frame
let frame = 0;
const local = new Map(); // frame -> {bits, quit}, ours
const remote = new Map(); // frame -> {bits, quit}, the other player's
let quitsent = false;
const bits = [0, 0]; // the keys of each player on this frame
const ours = new Map(); // tick -> hash of the game state
const theirs = new Map(); // the same of the other player's game
let wake = null; // to go on when the other player's keys come
let events = {};

// Connects to the room, and tells events: wait() as the other player is
// waited for, start() when the game can start, left() if the other player
// goes, error(), outofstep(tick) if the games aren't the same any more.
export function join(room, handlers) {
  leave();
  events = handlers;
  const url = new URL('ws', location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(url);
  ws.onopen = () => {
    send({ type: 'join', room });
    events.wait?.();
  };
  ws.onmessage = (e) => receive(JSON.parse(e.data));
  ws.onerror = () => events.error?.();
  ws.onclose = () => {
    ws = null;
    gone();
  };
}

export function leave() {
  if (ws !== null) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  lockstep = false;
}

function send(m) {
  if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function receive(m) {
  switch (m.type) {
    case 'start':
      net.me = m.player;
      net.seed = m.seed;
      events.start?.();
      break;
    case 'input':
      remote.set(m.frame, { bits: m.bits, quit: m.quit === true });
      break;
    case 'hash':
      theirs.set(m.tick, m.hash);
      compare(m.tick);
      break;
    case 'left':
      gone();
      break;
  }
  if (wake !== null) wake();
}

function gone() {
  if (dg.net && lockstep) {
    dg.escape = true;
    events.left?.();
  }
  if (wake !== null) wake();
}

// A game starts: the frames count from here.
export function begin() {
  frame = 0;
  local.clear();
  remote.clear();
  ours.clear();
  theirs.clear();
  bits.fill(0);
  net.quitter = -1;
  quitsent = false;
  lockstep = true;
}

// The game is over: no more waiting for the other player.
export function end() {
  lockstep = false;
}

// The next frame of the game: sends the keys pressed (and whether Escape
// was), and waits for those of the other player for it.
export async function nextframe(keys, quit) {
  if (!lockstep) return;
  const q = quit && !quitsent;
  if (q) quitsent = true;
  local.set(frame + DELAY, { bits: keys, quit: q });
  send({ type: 'input', frame: frame + DELAY, bits: keys, quit: q });
  if (frame >= DELAY) {
    while (!remote.has(frame) && !dg.escape) {
      // The other player gone doesn't always wake it: look again every so often
      await new Promise((resolve) => {
        wake = resolve;
        setTimeout(resolve, 50);
      });
      wake = null;
    }
  }
  if (dg.escape) { // the other player is gone
    lockstep = false;
    return;
  }
  const mine = local.get(frame) ?? { bits: 0, quit: false };
  const other = remote.get(frame) ?? { bits: 0, quit: false };
  bits[net.me] = mine.bits;
  bits[1 - net.me] = other.bits;
  local.delete(frame);
  remote.delete(frame);
  frame++;
  if (mine.quit || other.quit) {
    net.quitter = mine.quit ? net.me : 1 - net.me;
    dg.escape = true;
    lockstep = false;
  }
}

// The keys of player n on this frame.
export function keys(n) {
  return bits[n];
}

// Whether the game state is to be checked on this tick, see checkhash().
export function hashtick(tick) {
  return lockstep && tick % HASH_EVERY === 0;
}

// Sends the hash of the game state on a tick to the other player, to be
// checked against theirs.
export function checkhash(tick, hash) {
  ours.set(tick, hash);
  send({ type: 'hash', tick, hash });
  compare(tick);
}

function compare(tick) {
  if (!ours.has(tick) || !theirs.has(tick)) return;
  if (ours.get(tick) !== theirs.get(tick)) events.outofstep?.(tick);
  ours.delete(tick);
  theirs.delete(tick);
}

// The random seed of a round of the game: the same for both players.
export function roundseed(round) {
  let x = (net.seed ^ Math.imul(round + 1, 0x9e3779b9)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) | 0;
}
