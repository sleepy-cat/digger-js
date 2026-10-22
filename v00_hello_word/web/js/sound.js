// Sound: the original PC speaker routines (sound_backend.c), run 72.8 times
// a second by the audio callback, and an emulation of the two timers that
// drive the speaker (newsnd.c, soundgen.c).

import { dg, FIREBALLS } from './state.js';
import { getlives } from './digger.js';

export const MUSIC_BONUS = 0;
export const MUSIC_MAIN = 1;
export const MUSIC_DIRGE = 2;

const TUNE_BONUS = 0;
const TUNE_MAIN = 1;
const TUNE_DIRGE = 2;
const TUNE_BATTLE = 3;

const PIT_FREQ = 0x1234dd;

let ctx = null;

// Sound and music as switched on and off by the player.
let soundflag = true;
let musicflag = true;

// --- The speaker: timer 0 makes the music, timer 2 the sound effects --------

const T0 = 0;
const T2 = 1;

const bands = [0, 1].map(() => ({
  mod: false, freq: 0, lut: [0, 0], on: false, muted: false, phase: 0,
}));

let spkrmode = 0;
let pulsewidth = 1;
let t0rate = 0;

function setband(b, freq, a0, a1, mod) {
  const band = bands[b];
  const on = freq > 0 && (mod || a0 > 0);
  if (on && !band.on) band.phase = 0;
  Object.assign(band, { mod, freq, lut: [a0, a1], on });
}

function timer0(t0) {
  if (t0 > 40 && t0 < 0x4000) setband(T0, Math.floor(PIT_FREQ / t0), (pulsewidth - 1) / 49, -(pulsewidth - 1) / 49, false);
  else setband(T0, 0, 0, 0, false);
  t0rate = t0;
}

function timer2(t2, mode) {
  if (!(t2 > 40 && t2 < 0x4000)) {
    setband(T2, 0, 0, 0, false);
  } else if (!mode) {
    setband(T2, Math.floor(PIT_FREQ / t2), 1, -1, false);
  } else {
    // Timer 2 gating timer 0: the note sounds at the beat of the two
    setband(T2, Math.floor(PIT_FREQ / t2) - Math.floor(PIT_FREQ / t0rate), 1, 0, true);
    if (bands[T2].muted) bands[T2].phase = 0;
    bands[T2].muted = false;
  }
}

// Which of the timers the speaker listens to: 0 timer 2, 1 timer 0, 2 none.
function setspkrt2() {
  bands[T0].muted = spkrmode !== 1;
  bands[T2].muted = spkrmode !== 0;
}

function speakeroff() {
  bands[T0].muted = true;
  bands[T2].muted = true;
}

function getsample(rate) {
  let out = 0;
  let mod = 1;
  for (const b of bands) {
    if (!b.on) continue;
    b.phase += b.freq / rate;
    b.phase -= Math.floor(b.phase);
    if (b.muted) continue;
    const v = b.phase < 0.5 ? b.lut[0] : b.lut[1];
    if (b.mod) mod *= v;
    else out += v;
  }
  return (out / bands.length) * mod;
}

// --- The sound routines of the game ------------------------------------------

let wavetype = 0;
let musvol = 0;
let t2val = 0;
let t0val = 0;
let sndflag = false;
let soundpausedflag = false;
let soundt0flag = false;
let randvs = 0;
let restoremusicflag = false;
let dirgepending = false;

let levdoneactive = false;
let nljpointer = 0;
let nljnoteduration = 0;

function randnos(n) {
  randvs = (Math.imul(randvs, 0x15a4e35) + 1) | 0;
  return (randvs & 0x7fffffff) % n;
}

function sett2val(t2v, mode) {
  if (sndflag) timer2(t2v, mode);
}

function sett0(mode) {
  if (!sndflag) return;
  if (!mode) timer2(t2val, mode);
  if (t0val < 1000 && (wavetype === 1 || wavetype === 2)) t0val = 1000;
  musvol = Math.min(Math.max(musvol, 1), 50);
  pulsewidth = musvol;
  timer0(t0val);
  setsoundmode();
}

function setsoundt2() {
  if (soundt0flag) {
    spkrmode = 0;
    soundt0flag = false;
    setspkrt2();
  }
}

function setsoundmode() {
  spkrmode = wavetype;
  if (!soundt0flag && sndflag) {
    soundt0flag = true;
    setspkrt2();
  }
}

// Called 72.8 times a second.
function soundint() {
  if (soundflag && !sndflag) sndflag = musicflag = true;
  if (!soundflag && sndflag) {
    sndflag = false;
    timer2(40, false);
    setsoundt2();
    speakeroff();
  }
  if (sndflag && !soundpausedflag) {
    t0val = 0x7d00;
    t2val = 40;
    if (musicflag) musicupdate();
    for (const e of effects) e.update();
    if (t0val === 0x7d00 || t2val !== 40) {
      setsoundt2();
    } else {
      setsoundmode();
      sett0(false);
    }
    sett2val(t2val, false);
  }
  if (levdoneactive) levdoneupdate();
}

const newlevjingle = [0x8e8, 0x712, 0x5f2, 0x7f0, 0x6ac, 0x54c, 0x712, 0x5f2, 0x4b8, 0x474, 0x474];

function levdoneupdate() {
  if (!sndflag) {
    levdoneoff();
    return;
  }
  if (nljpointer < 11) t2val = newlevjingle[nljpointer];
  t0val = t2val + 35;
  musvol = 50;
  setsoundmode();
  sett0(true);
  sett2val(t2val, true);
  if (nljnoteduration > 0) {
    nljnoteduration--;
  } else {
    nljnoteduration = 20;
    nljpointer++;
    if (nljpointer > 10) levdoneoff();
  }
}

function levdoneoff() {
  levdoneactive = false;
  soundpausedflag = false;
}

// --- Sound effects: each one sets t2val while it plays -----------------------

const fall = {
  flag: false, f: false, value: 0, n: 0,
  on() { this.value = 1000; this.flag = true; },
  off() { this.flag = false; this.n = 0; },
  update() {
    if (!this.flag) return;
    if (this.n < 1) {
      this.n++;
      if (this.f) t2val = this.value;
    } else {
      this.n = 0;
      if (this.f) {
        this.value += 50;
        this.f = false;
      } else {
        this.f = true;
      }
    }
  },
};

const brk = {
  flag: false, duration: 0, value: 0,
  on() {
    this.duration = 3;
    if (this.value < 15000) this.value = 15000;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    if (this.duration !== 0) {
      this.duration--;
      t2val = this.value;
    } else {
      this.flag = false;
    }
  },
};

const wobble = {
  flag: false, n: 0,
  on() { this.flag = true; },
  off() { this.flag = false; this.n = 0; },
  update() {
    if (!this.flag) return;
    this.n++;
    if (this.n > 63) this.n = 0;
    switch (this.n) {
      case 0: t2val = 0x7d0; break;
      case 16: case 48: t2val = 0x9c4; break;
      case 32: t2val = 0xbb8; break;
    }
  },
};

const fire = {
  flag: [false, false], f: [false, false], value: [0, 0], n: [0, 0], w: 0,
  on(i) { this.value[i] = 500; this.flag[i] = true; },
  off(i) { this.flag[i] = false; this.n[i] = 0; },
  update() {
    let any = false;
    for (let i = 0; i < FIREBALLS; i++) {
      this.f[i] = false;
      if (!this.flag[i]) continue;
      if (this.n[i] === 1) {
        this.n[i] = 0;
        this.value[i] += Math.trunc(this.value[i] / 55);
        this.f[i] = any = true;
        if (this.value[i] > 30000) this.off(i);
      } else {
        this.n[i]++;
      }
    }
    if (!any) return;
    let i;
    do {
      i = this.w++;
      if (this.w === FIREBALLS) this.w = 0;
    } while (!this.f[i]);
    t2val = this.value[i] + randnos(this.value[i] >> 3);
  },
};

const explode = {
  flag: [false, false], f: [false, false], value: [0, 0], duration: [0, 0], w: 0,
  on(i) {
    this.value[i] = 1500;
    this.duration[i] = 10;
    this.flag[i] = true;
    fire.off(i);
  },
  off(i) { this.flag[i] = false; },
  update() {
    let any = false;
    for (let i = 0; i < FIREBALLS; i++) {
      this.f[i] = false;
      if (!this.flag[i]) continue;
      if (this.duration[i] !== 0) {
        this.value[i] -= this.value[i] >> 3;
        this.duration[i]--;
        this.f[i] = any = true;
      } else {
        this.flag[i] = false;
      }
    }
    if (!any) return;
    let i;
    do {
      i = this.w++;
      if (this.w === FIREBALLS) this.w = 0;
    } while (!this.f[i]);
    t2val = this.value[i];
  },
};

const bonus = {
  flag: false, n: 0,
  on() { this.flag = true; },
  off() { this.flag = false; this.n = 0; },
  update() {
    if (!this.flag) return;
    this.n++;
    if (this.n > 15) this.n = 0;
    if (this.n >= 0 && this.n < 6) t2val = 0x4ce;
    if (this.n >= 8 && this.n < 14) t2val = 0x5e9;
  },
};

const em = {
  flag: false,
  on() { this.flag = true; },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    t2val = 1000;
    this.off();
  },
};

const emfreqs = [0x8e8, 0x7f0, 0x712, 0x6ac, 0x5f2, 0x54c, 0x4b8, 0x474];

const emerald = {
  flag: false, duration: 0, freq: 0, n: 0,
  on(i) {
    this.freq = emfreqs[i];
    this.duration = 7;
    this.n = 0;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    if (this.duration === 0) {
      this.off();
      return;
    }
    if (this.n === 0 || this.n === 1) t2val = this.freq;
    this.n++;
    if (this.n > 7) {
      this.n = 0;
      this.duration--;
    }
  },
};

const gold = {
  flag: false, f: false, value1: 0, value2: 0, duration: 0,
  on() {
    this.value1 = 500;
    this.value2 = 4000;
    this.duration = 30;
    this.f = false;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    if (this.duration !== 0) this.duration--;
    else this.flag = false;
    t2val = this.f ? this.value1 : this.value2;
    this.f = !this.f;
    this.value1 += this.value1 >> 4;
    this.value2 -= this.value2 >> 4;
  },
};

const eatm = {
  flag: false, value: 0, duration: 0, n: 0,
  on() {
    this.duration = 20;
    this.n = 3;
    this.value = 2000;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    if (this.n === 0) {
      this.flag = false;
    } else if (this.duration !== 0) {
      if (this.duration % 4 === 1) t2val = this.value;
      if (this.duration % 4 === 3) t2val = this.value - (this.value >> 4);
      this.duration--;
      this.value -= this.value >> 4;
    } else {
      this.duration = 20;
      this.n--;
      this.value = 2000;
    }
  },
};

const ddie = {
  flag: false, n: 0, value: 0,
  on() {
    this.n = 0;
    this.value = 20000;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    this.n++;
    if (this.n === 1) stopmusic();
    if (this.n >= 1 && this.n <= 10) this.value = 20000 - this.n * 1000;
    if (this.n > 10) this.value += 500;
    if (this.value > 30000) this.off();
    t2val = this.value;
  },
};

const oneup = {
  flag: false, duration: 0,
  on() {
    this.duration = 96;
    this.flag = true;
  },
  off() { this.flag = false; },
  update() {
    if (!this.flag) return;
    if (Math.trunc(this.duration / 3) % 2 !== 0) t2val = (this.duration << 2) + 600;
    this.duration--;
    if (this.duration < 1) this.flag = false;
  },
};

const effects = [emerald, wobble, ddie, brk, gold, em, explode, fire, eatm, fall, oneup, bonus];

// --- Music -------------------------------------------------------------------

const bonusjingle = [
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0xd59, 4, 0xbe4, 4, 0xa98, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0x11d1, 4, 0xd59, 2, 0xa98, 2, 0xbe4, 4, 0xe24, 4, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0xd59, 4, 0xbe4, 4,
  0xa98, 4, 0xd59, 2, 0xa98, 2, 0x8e8, 10, 0xa00, 2, 0xa98, 2, 0xbe4, 2, 0xd59, 4,
  0xa98, 4, 0xd59, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0xd59, 4, 0xbe4, 4, 0xa98, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0xd59, 2, 0xa98, 2, 0xbe4, 4, 0xe24, 4, 0x11d1, 4,
  0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2, 0x11d1, 4, 0x11d1, 2, 0x11d1, 2,
  0xd59, 4, 0xbe4, 4, 0xa98, 4, 0xd59, 2, 0xa98, 2, 0x8e8, 10, 0xa00, 2, 0xa98, 2,
  0xbe4, 2, 0xd59, 4, 0xa98, 4, 0xd59, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2,
  0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4,
  0xa98, 4, 0x7f0, 4, 0xa98, 4, 0xbe4, 4, 0xd59, 4, 0xe24, 4, 0xfdf, 4, 0xa98, 2,
  0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4,
  0x970, 4, 0x8e8, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0xa98, 4, 0x7f0, 4,
  0xa98, 4, 0xbe4, 4, 0xd59, 4, 0xe24, 4, 0xfdf, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4,
  0xa98, 2, 0xa98, 2, 0xa98, 4, 0xa98, 2, 0xa98, 2, 0xa98, 4, 0x7f0, 4, 0xa98, 4,
  0x7f0, 4, 0xa98, 4, 0x7f0, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4, 0x970, 4, 0x8e8, 4,
  0x7d64,
];

const backgjingle = [
  0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2,
  0x11d1, 2, 0xfdf, 2, 0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0xe24, 2,
  0xd59, 2, 0xe24, 2, 0xd59, 2, 0xfdf, 2, 0xe24, 2, 0xfdf, 2, 0xe24, 2, 0x11d1, 2,
  0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1400, 2, 0xfdf, 4, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2,
  0x1530, 2, 0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2, 0x1530, 2,
  0x1ab2, 2, 0x1530, 2, 0x1fbf, 4, 0xfdf, 2, 0xe24, 2, 0xd59, 2, 0xe24, 2, 0xd59, 2,
  0xfdf, 2, 0xe24, 2, 0xfdf, 2, 0xe24, 2, 0x11d1, 2, 0xfdf, 2, 0x11d1, 2, 0xfdf, 2,
  0xe24, 2, 0xd59, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2,
  0x1530, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4,
  0xa98, 2, 0x970, 2, 0x8e8, 2, 0x970, 2, 0x8e8, 2, 0xa98, 2, 0x970, 2, 0xa98, 2,
  0x970, 2, 0xbe4, 2, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0xa98, 4, 0xa98, 2,
  0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0xbe4, 2,
  0xa98, 2, 0xd59, 2, 0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0x970, 2, 0x8e8, 2,
  0x970, 2, 0x8e8, 2, 0xa98, 2, 0x970, 2, 0xa98, 2, 0x970, 2, 0xbe4, 2, 0xa98, 2,
  0xbe4, 2, 0xa98, 2, 0xd59, 2, 0xa98, 4, 0x7f0, 2, 0x8e8, 2, 0xa98, 2, 0xd59, 2,
  0x11d1, 2, 0xd59, 2, 0x1530, 4, 0xa98, 2, 0xbe4, 2, 0xa98, 2, 0xd59, 2, 0x11d1, 2,
  0xd59, 2, 0x1530, 4, 0xa98, 2, 0x970, 2, 0x8e8, 2, 0x970, 2, 0x8e8, 2, 0xa98, 2,
  0x970, 2, 0xa98, 2, 0x970, 2, 0xbe4, 2, 0xa98, 2, 0xbe4, 2, 0xd59, 2, 0xbe4, 2,
  0xa98, 4, 0x7d64,
];

const dirge = [
  0x7d00, 2, 0x11d1, 6, 0x11d1, 4, 0x11d1, 2, 0x11d1, 6, 0xefb, 4, 0xfdf, 2,
  0xfdf, 4, 0x11d1, 2, 0x11d1, 4, 0x12e0, 2, 0x11d1, 12, 0x7d00, 16, 0x7d00, 16,
  0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d00, 16,
  0x7d00, 16, 0x7d00, 16, 0x7d00, 16, 0x7d64,
];

// "I vnov prodolzhaetsya boi", played on the last life.
const battlejingle = [
  0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6, 0xd59, 2, 0xbe4, 24,
  0xd59, 6, 0xefb, 2, 0xfdf, 8, 0xd59, 16, 0xefb, 4, 0xfdf, 4, 0x11d1, 24,
  0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6, 0xd59, 2, 0xbe4, 4,
  0xb39, 4, 0xbe4, 16, 0xbe4, 6, 0xa98, 2, 0xa00, 20, 0xa98, 4, 0xbe4, 6,
  0xc99, 2, 0xbe4, 56, 0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4, 0xfdf, 6,
  0x11d1, 6, 0x12e0, 4, 0x11d1, 24, 0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4,
  0xfdf, 6, 0x11d1, 6, 0x13ff, 4, 0xbe4, 24, 0xefb, 8, 0x8e8, 8, 0x8e8, 16,
  0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8, 0x8e8, 8, 0xb39, 4,
  0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4, 0x11d1, 24, 0xefb, 8,
  0x8e8, 8, 0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8,
  0x8e8, 8, 0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4,
  0x11d1, 56, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6, 0xd59, 2,
  0xbe4, 24, 0xd59, 6, 0xefb, 2, 0xfdf, 8, 0xd59, 16, 0xefb, 4, 0xfdf, 4,
  0x11d1, 24, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6, 0xd59, 2,
  0xbe4, 4, 0xb39, 4, 0xbe4, 16, 0xbe4, 6, 0xa98, 2, 0xa00, 20, 0xa98, 4,
  0xbe4, 6, 0xc99, 2, 0xbe4, 56, 0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4,
  0xfdf, 6, 0x11d1, 6, 0x12e0, 4, 0x11d1, 24, 0xbe4, 8, 0xb39, 8, 0xd59, 4,
  0xefb, 4, 0xfdf, 6, 0x11d1, 6, 0x13ff, 4, 0xbe4, 24, 0xefb, 8, 0x8e8, 8,
  0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8, 0x8e8, 8,
  0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4, 0x11d1, 24,
  0xefb, 8, 0x8e8, 8, 0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4,
  0xa00, 8, 0x8e8, 8, 0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4,
  0x12e0, 4, 0x11d1, 56, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6,
  0xd59, 2, 0xbe4, 24, 0xd59, 6, 0xefb, 2, 0xfdf, 8, 0xd59, 16, 0xefb, 4,
  0xfdf, 4, 0x11d1, 24, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6,
  0xd59, 2, 0xbe4, 8, 0xbe4, 16, 0xbe4, 6, 0xa98, 2, 0xa00, 20, 0xa98, 4,
  0xbe4, 6, 0xc99, 2, 0xbe4, 56, 0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4,
  0xfdf, 6, 0x11d1, 6, 0x12e0, 4, 0x11d1, 24, 0xbe4, 8, 0xb39, 8, 0xd59, 4,
  0xefb, 4, 0xfdf, 6, 0x11d1, 6, 0x13ff, 4, 0xbe4, 24, 0xefb, 8, 0x8e8, 8,
  0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8, 0x8e8, 8,
  0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4, 0x11d1, 24,
  0xefb, 8, 0x8e8, 8, 0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4,
  0xa00, 8, 0x8e8, 8, 0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4,
  0x12e0, 4, 0x11d1, 56, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6,
  0xd59, 2, 0xbe4, 24, 0xd59, 6, 0xefb, 2, 0xfdf, 8, 0xd59, 16, 0xefb, 4,
  0xfdf, 4, 0x11d1, 24, 0x11d1, 4, 0xfdf, 4, 0xefb, 20, 0xfdf, 4, 0xefb, 6,
  0xd59, 2, 0xbe4, 8, 0xbe4, 16, 0xbe4, 6, 0xa98, 2, 0xa00, 20, 0xa98, 4,
  0xbe4, 6, 0xc99, 2, 0xbe4, 56, 0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4,
  0xfdf, 6, 0x11d1, 6, 0x12e0, 4, 0x11d1, 24, 0xbe4, 8, 0xb39, 8, 0xd59, 4,
  0xefb, 4, 0xfdf, 6, 0x11d1, 6, 0x13ff, 4, 0xbe4, 24, 0xefb, 8, 0x8e8, 8,
  0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8, 0x8e8, 8,
  0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4, 0x11d1, 24,
  0xefb, 8, 0x8e8, 8, 0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4,
  0xa00, 8, 0x8e8, 8, 0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4,
  0x12e0, 4, 0x11d1, 16, 0x11d1, 40, 0xfdf, 8, 0xefb, 8, 0xfdf, 8, 0x11d1, 8,
  0xbe4, 8, 0xb39, 8, 0xd59, 4, 0xefb, 4,
  0xfdf, 6, 0x11d1, 6, 0x12e0, 4, 0x11d1, 24, 0xbe4, 8, 0xb39, 8, 0xd59, 4,
  0xefb, 4, 0xfdf, 6, 0x11d1, 6, 0x13ff, 4, 0xbe4, 24, 0xefb, 8, 0x8e8, 8,
  0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4, 0xa00, 8, 0x8e8, 8,
  0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4, 0x12e0, 4, 0x11d1, 24,
  0xefb, 8, 0x8e8, 8, 0x8e8, 16, 0x7f0, 8, 0x77e, 8, 0x7f0, 4, 0x8e8, 4,
  0xa00, 8, 0x8e8, 8, 0xb39, 4, 0xd59, 8, 0xefb, 4, 0xfdf, 8, 0x11d1, 4,
  0x12e0, 4, 0x11d1, 6, 0x7d00, 16, 0x7d64,
];

// The tunes: notes and the shape of their volume.
const tunes = [
  { notes: bonusjingle, maxvol: 50, attack: 20, sustain: 20, decay: 10, release: 4, dfac: 3 },
  { notes: backgjingle, maxvol: 50, attack: 50, sustain: 8, decay: 15, release: 1, dfac: 6 },
  { notes: dirge, maxvol: 50, attack: 50, sustain: 25, decay: 5, release: 1, dfac: 10 },
  { notes: battlejingle, maxvol: 50, attack: 28, sustain: 26, decay: 8, release: 4, dfac: 2 },
];

let musicplaying = false;
let tune = tunes[TUNE_BONUS];
let tuneno = TUNE_BONUS;
let musicp = 0;
let noteduration = 0;
let notevalue = 0;
let musicnotewidth = 0;
let musicstage = 0;
let musicn = 0;
let musicdfac = 0;
let curmusic = -1;
let curdfac = 1;

function musicupdate() {
  if (!musicplaying) return;
  if (noteduration !== 0) {
    noteduration--;
  } else {
    musicstage = musicn = 0;
    const notes = tune.notes;
    noteduration = Math.trunc(notes[musicp + 1] * musicdfac);
    musicnotewidth = tuneno === TUNE_MAIN ? Math.trunc(musicdfac * 2) : Math.trunc(noteduration - musicdfac);
    notevalue = notes[musicp];
    if (tuneno === TUNE_BATTLE && notevalue < 0x7d00) {
      // Up a major second to brighten the tune
      notevalue = Math.trunc((notevalue * 891 + 500) / 1000);
    }
    if (tuneno === TUNE_DIRGE && musicp > 0 && notevalue === 0x7d00) {
      dirgepending = false; // over but for the final rest
      if (restoremusicflag) {
        musicflag = false;
        restoremusicflag = false;
      }
    }
    musicp += 2;
    if (notes[musicp] === 0x7d64) musicp = 0;
  }
  musicn++;
  wavetype = 1;
  t0val = notevalue;
  if (musicn >= musicnotewidth) musicstage = 2;
  switch (musicstage) {
    case 0: // attack
      if (musvol + tune.attack >= tune.maxvol) {
        musicstage = 1;
        musvol = tune.maxvol;
      } else {
        musvol += tune.attack;
      }
      break;
    case 1: // decay
      musvol = Math.max(musvol - tune.decay, tune.sustain);
      break;
    case 2: // release
      musvol = Math.max(musvol - tune.release, 1);
      break;
  }
  if (musvol === 1) t0val = 0x7d00;
}

function musictune(request) {
  if (request === MUSIC_MAIN) return getlives(dg.curplayer) === 1 ? TUNE_BATTLE : TUNE_MAIN;
  return request; // the same numbers for bonus and dirge
}

export function music(request, dfac = 1.0) {
  curmusic = request;
  curdfac = dfac;
  dirgepending = false;
  if (!sndflag) return;
  musicp = 0;
  noteduration = 0;
  tuneno = musictune(request);
  tune = tunes[tuneno];
  musicdfac = tune.dfac * dfac;
  musicplaying = true;
  if (tuneno === TUNE_DIRGE) {
    // The dirge plays with the music off too
    if (!musicflag) {
      musicflag = true;
      restoremusicflag = true;
    }
    ddie.off();
    dirgepending = true;
  }
}

// The main tune depends on the number of lives left: switch it if that has
// changed while it is playing.
export function musicrefresh() {
  if (curmusic === MUSIC_MAIN && musictune(MUSIC_MAIN) !== tuneno) music(MUSIC_MAIN, curdfac);
}

export function musicoff() {
  curmusic = -1;
  stopmusic();
}

function stopmusic() {
  musicplaying = false;
  musicp = 0;
  dirgepending = false;
  if (restoremusicflag) {
    musicflag = false;
    restoremusicflag = false;
  }
}

// Whether the dirge is still to be heard, for the game to wait for it.
export function dirgeplaying() {
  return dirgepending && sndflag && running();
}

export function soundstop() {
  levdoneoff();
  fall.off();
  wobble.off();
  for (let i = 0; i < FIREBALLS; i++) {
    fire.off(i);
    explode.off(i);
  }
  musicoff();
  for (const e of [bonus, brk, em, emerald, gold, eatm, ddie, oneup]) e.off();
}

// Plays the level done jingle, the game waits for it.
export async function soundlevdone() {
  soundstop();
  if (!sndflag || !running()) return;
  nljpointer = 0;
  nljnoteduration = 20;
  levdoneactive = true;
  soundpausedflag = true;
  while (levdoneactive && !dg.escape && running()) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  levdoneoff();
}

export const soundfall = () => fall.on();
export const soundfalloff = () => fall.off();
export const soundbreak = () => brk.on();
export const soundwobble = () => wobble.on();
export const soundwobbleoff = () => wobble.off();
export const soundfire = (n) => fire.on(n);
export const soundfireoff = (n) => fire.off(n);
export const soundexplode = (n) => explode.on(n);
export const soundbonus = () => bonus.on();
export const soundbonusoff = () => bonus.off();
export const soundem = () => em.on();
export const soundemerald = (n) => emerald.on(n);
export const soundgold = () => gold.on();
export const soundeatm = () => eatm.on();
export const soundddie = () => ddie.on();
export const sound1up = () => oneup.on();

export function soundpause() {
  if (soundpausedflag) return;
  soundpausedflag = true;
  if (sndflag) {
    timer2(40, false);
    setsoundt2();
    speakeroff();
  }
}

export function soundpauseoff() {
  soundpausedflag = false;
}

export function togglesound() {
  soundflag = !soundflag;
}

export function togglemusic() {
  musicflag = !musicflag;
}

// Silence while the high score initials are typed in.
let killed = false;

export function killsound() {
  setsoundt2();
  timer2(40, false);
  killed = true;
}

export function setupsound() {
  killed = false;
}

// --- The audio device --------------------------------------------------------

function running() {
  return ctx !== null && ctx.state === 'running';
}

export function init() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  ctx = new AudioContext();
  const rate = ctx.sampleRate;
  const intmod = Math.round(rate / 72.8);
  let step = 0;

  timer2(40, false);
  setspkrt2();
  timer0(0);
  wavetype = 2;
  t0val = 12000;
  musvol = 8;
  t2val = 40;
  soundt0flag = true;
  sndflag = true;
  spkrmode = 0;
  setsoundt2();
  soundstop();
  timer0(0x4000);

  // A ScriptProcessorNode runs on the main thread, like the rest of the game.
  const node = ctx.createScriptProcessor(2048, 0, 1);
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) {
      step++;
      if (step % intmod === 0) soundint();
      out[i] = killed ? 0 : getsample(rate);
    }
  };
  const gain = ctx.createGain();
  gain.gain.value = 0.25;
  node.connect(gain).connect(ctx.destination);
}

export function resume() {
  if (ctx !== null && ctx.state === 'suspended') ctx.resume();
}
