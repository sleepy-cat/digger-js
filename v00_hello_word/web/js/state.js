// Game state shared by multiple modules (game.c, def.h).

export const DIR_NONE = -1;
export const DIR_RIGHT = 0;
export const DIR_UP = 2;
export const DIR_LEFT = 4;
export const DIR_DOWN = 6;

export const TYPES = 5;
export const BONUSES = 1;
export const BAGS = 7;
export const MONSTERS = 6;
export const DIGGERS = 2;
export const FIREBALLS = DIGGERS;
export const SPRITES = BONUSES + BAGS + MONSTERS + FIREBALLS + DIGGERS;

export const FIRSTBONUS = 0;
export const LASTBONUS = FIRSTBONUS + BONUSES;
export const FIRSTBAG = LASTBONUS;
export const LASTBAG = FIRSTBAG + BAGS;
export const FIRSTMONSTER = LASTBAG;
export const LASTMONSTER = FIRSTMONSTER + MONSTERS;
export const FIRSTFIREBALL = LASTMONSTER;
export const LASTFIREBALL = FIRSTFIREBALL + FIREBALLS;
export const FIRSTDIGGER = LASTFIREBALL;
export const LASTDIGGER = FIRSTDIGGER + DIGGERS;

export const MWIDTH = 15;
export const MHEIGHT = 10;
export const MSIZE = MWIDTH * MHEIGHT;

// Milliseconds in one frame (game tick) at the default speed, 12.5Hz.
export const DEFAULT_FTIME = 80;

// The gauntlet clock of the original: it runs at 1193181 a second (the PC
// timer) and goes down by 80000 a tick, so 120 seconds last 1790 ticks.
export const GAUNTLET_SECOND = 1193181;
export const GAUNTLET_TICK = 80000;

export const dg = {
  nplayers: 1,
  diggers: 1,
  curplayer: 0,
  startlev: 1,
  gauntlet: false,
  gtime: 120, // gauntlet time, seconds
  cgtime: 0, // gauntlet time left, see GAUNTLET_SECOND
  timeout: false,
  ftime: DEFAULT_FTIME,
  randv: 0,
  escape: false,
  // Set by digger.js, read by the others.
  bonusmode: false,
  bonusvisible: false,
};

export const leveldat = [
  ['S   B     HHHHS',
    'V  CC  C  V B  ',
    'VB CC  C  V    ',
    'V  CCB CB V CCC',
    'V  CC  C  V CCC',
    'HH CC  C  V CCC',
    ' V    B B V    ',
    ' HHHH     V    ',
    'C   V     V   C',
    'CC  HHHHHHH  CC'],
  ['SHHHHH  B B  HS',
    ' CC  V       V ',
    ' CC  V CCCCC V ',
    'BCCB V CCCCC V ',
    'CCCC V       V ',
    'CCCC V B  HHHH ',
    ' CC  V CC V    ',
    ' BB  VCCCCV CC ',
    'C    V CC V CC ',
    'CC   HHHHHH    '],
  ['SHHHHB B BHHHHS',
    'CC  V C C V BB ',
    'C   V C C V CC ',
    ' BB V C C VCCCC',
    'CCCCV C C VCCCC',
    'CCCCHHHHHHH CC ',
    ' CC  C V C  CC ',
    ' CC  C V C     ',
    'C    C V C    C',
    'CC   C H C   CC'],
  ['SHBCCCCBCCCCBHS',
    'CV  CCCCCCC  VC',
    'CHHH CCCCC HHHC',
    'C  V  CCC  V  C',
    '   HHH C HHH   ',
    '  B  V B V  B  ',
    '  C  VCCCV  C  ',
    ' CCC HHHHH CCC ',
    'CCCCC CVC CCCCC',
    'CCCCC CHC CCCCC'],
  ['SHHHHHHHHHHHHHS',
    'VBCCCCBVCCCCCCV',
    'VCCCCCCV CCBC V',
    'V CCCC VCCBCCCV',
    'VCCCCCCV CCCC V',
    'V CCCC VBCCCCCV',
    'VCCBCCCV CCCC V',
    'V CCBC VCCCCCCV',
    'VCCCCCCVCCCCCCV',
    'HHHHHHHHHHHHHHH'],
  ['SHHHHHHHHHHHHHS',
    'VCBCCV V VCCBCV',
    'VCCC VBVBV CCCV',
    'VCCCHH V HHCCCV',
    'VCC V CVC V CCV',
    'VCCHH CVC HHCCV',
    'VC V CCVCC V CV',
    'VCHHBCCVCCBHHCV',
    'VCVCCCCVCCCCVCV',
    'HHHHHHHHHHHHHHH'],
  ['SHCCCCCVCCCCCHS',
    ' VCBCBCVCBCBCV ',
    'BVCCCCCVCCCCCVB',
    'CHHCCCCVCCCCHHC',
    'CCV CCCVCCC VCC',
    'CCHHHCCVCCHHHCC',
    'CCCCV CVC VCCCC',
    'CCCCHH V HHCCCC',
    'CCCCCV V VCCCCC',
    'CCCCCHHHHHCCCCC'],
  ['HHHHHHHHHHHHHHS',
    'V CCBCCCCCBCC V',
    'HHHCCCCBCCCCHHH',
    'VBV CCCCCCC VBV',
    'VCHHHCCCCCHHHCV',
    'VCCBV CCC VBCCV',
    'VCCCHHHCHHHCCCV',
    'VCCCC V V CCCCV',
    'VCCCCCV VCCCCCV',
    'HHHHHHHHHHHHHHH'],
];

// The game's own random numbers: the same generator as the original.
export function randno(n) {
  dg.randv = (Math.imul(dg.randv, 0x15a4e35) + 1) | 0;
  return (dg.randv & 0x7fffffff) % n;
}

export function reversedir(dir) {
  switch (dir) {
    case DIR_RIGHT: return DIR_LEFT;
    case DIR_LEFT: return DIR_RIGHT;
    case DIR_UP: return DIR_DOWN;
    case DIR_DOWN: return DIR_UP;
  }
  return dir;
}

// Integer division as in C, for coordinates that may be negative.
export function div(a, b) {
  return Math.trunc(a / b);
}
