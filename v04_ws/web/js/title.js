// The characters introduced on the title screen (title_anim.c).

import * as spr from './sprite.js';
import { DIR_RIGHT, DIR_UP, DIR_LEFT, FIRSTDIGGER, FIRSTFIREBALL, FIRSTMONSTER, FIRSTBAG } from './state.js';
import { outtext, erasetext, drawdigger, drawfire, drawgold, drawemerald, drawbonus } from './drawing.js';
import { MonsterObj } from './monster.js';

export const TITLE_ANIM_LAST_FRAME = 286;

const NOBBIN = 0;
const HOBBIN = 1;

// What happens, from the frame first to the frame last.
const once = (frame, action, ...args) => ({ first: frame, last: frame, action, args });
const span = (first, last, action, ...args) => ({ first, last, action, args });

const script = [
  once(0, 'clearText'),
  once(50, 'spawnMonster', NOBBIN, 292, 63),
  span(51, 77, 'moveMonster', NOBBIN, -4, 0),
  once(78, 'turnMonster', NOBBIN, DIR_RIGHT),
  once(83, 'label', 216, 64, 'NOBBIN'),
  // A second Nobbin comes in on its own row, goes up into the first one and
  // turns into a Hobbin by bumping into it, the way it happens in the game,
  // then goes back down
  once(90, 'spawnMonster', HOBBIN, 292, 82),
  span(91, 117, 'moveMonster', HOBBIN, -4, 0),
  span(118, 126, 'moveMonster', HOBBIN, 0, -3),
  span(129, 134, 'moveMonster', HOBBIN, 0, 3),
  span(137, 142, 'moveMonster', HOBBIN, 0, -3),
  once(145, 'mutateMonster', HOBBIN),
  span(146, 154, 'moveMonster', HOBBIN, 0, 3),
  once(155, 'turnMonster', HOBBIN, DIR_RIGHT),
  once(156, 'label', 216, 83, 'HOBBIN'),
  once(130, 'spawnDigger', 292, 101, DIR_LEFT),
  span(131, 157, 'moveDigger', -4, 0),
  once(163, 'label', 216, 102, 'DIGGER'),
  once(166, 'turnDigger', DIR_RIGHT),
  once(228, 'turnDigger', DIR_UP),
  once(178, 'gold', 184, 120),
  once(183, 'label', 216, 121, 'GOLD'),
  once(198, 'emerald', 184, 141),
  once(203, 'label', 216, 140, 'EMERALD'),
  once(218, 'bonus', 184, 158),
  once(223, 'label', 216, 159, 'BONUS'),
  once(232, 'discharge'),
  once(232, 'fire'),
  span(233, 237, 'moveBullet', 0, -4),
  once(237, 'killMonster', HOBBIN),
  once(238, 'explode'),
  once(243, 'removeBullet'),
  once(247, 'recharge'),
  once(251, 'discharge'),
  once(251, 'fire'),
  span(252, 260, 'moveBullet', 0, -4),
  once(260, 'killMonster', NOBBIN),
  once(261, 'explode'),
  once(266, 'removeBullet'),
  once(270, 'recharge'),
  once(274, 'turnDigger', DIR_RIGHT),
];

export class TitleAnim {
  constructor() {
    this.monsters = [null, null];
    this.monsterSpawned = [-1, -1];
    this.digger = null;
    this.diggerSpawned = -1;
    this.bullet = null;
    this.bulletSpawned = -1;
  }

  // Takes everything off the screen.
  reset() {
    this.removeBullet();
    if (this.digger !== null) {
      spr.erasespr(FIRSTDIGGER);
      this.digger = null;
    }
    for (let id = 0; id < 2; id++) {
      if (this.monsters[id] !== null) {
        spr.erasespr(FIRSTMONSTER + id);
        this.monsters[id] = null;
      }
    }
    this.monsterSpawned = [-1, -1];
    this.diggerSpawned = -1;
  }

  step(frame) {
    if (frame === 0) this.reset();
    for (const { first, last, action, args } of script) {
      if (frame >= first && frame <= last) this[action](frame, ...args);
    }
    this.monsters.forEach((m, id) => {
      if (m !== null && frame > this.monsterSpawned[id]) m.animate();
    });
    const d = this.digger;
    if (d !== null && frame > this.diggerSpawned) drawdigger(0, d.dir, d.x, d.y, d.canfire);
    const b = this.bullet;
    if (b !== null && frame > this.bulletSpawned && b.expsn < 4) {
      drawfire(0, b.x, b.y, b.expsn);
      if (b.expsn > 0) b.expsn++;
    }
  }

  clearText() {
    for (let y = 54; y < 174; y += 12) erasetext(12, 164, y, 0);
  }

  spawnMonster(frame, id, x, y) {
    if (this.monsters[id] !== null) return;
    this.monsters[id] = new MonsterObj(id, true, DIR_LEFT, x, y);
    this.monsters[id].put();
    this.monsterSpawned[id] = frame;
  }

  moveMonster(frame, id, dx, dy) {
    const m = this.monsters[id];
    if (m === null) return;
    m.x += dx;
    m.y += dy;
  }

  turnMonster(frame, id, dir) {
    if (this.monsters[id] !== null) this.monsters[id].dir = dir;
  }

  mutateMonster(frame, id) {
    if (this.monsters[id] !== null) this.monsters[id].mutate();
  }

  killMonster(frame, id) {
    if (this.monsters[id] !== null) this.monsters[id].kill();
  }

  spawnDigger(frame, x, y, dir) {
    this.digger = { x, y, dir, canfire: true };
    this.diggerSpawned = frame;
    spr.movedrawspr(FIRSTDIGGER, x, y);
  }

  moveDigger(frame, dx, dy) {
    if (this.digger === null) return;
    this.digger.x += dx;
    this.digger.y += dy;
  }

  turnDigger(frame, dir) {
    if (this.digger !== null) this.digger.dir = dir;
  }

  discharge() {
    if (this.digger !== null) this.digger.canfire = false;
  }

  recharge() {
    if (this.digger !== null) this.digger.canfire = true;
  }

  fire(frame) {
    if (this.digger === null) return;
    this.removeBullet();
    this.bullet = { x: this.digger.x + 4, y: this.digger.y, expsn: 0 };
    spr.movedrawspr(FIRSTFIREBALL, this.bullet.x, this.bullet.y);
    this.bulletSpawned = frame;
  }

  moveBullet(frame, dx, dy) {
    const b = this.bullet;
    if (b === null || b.expsn !== 0) return;
    b.x += dx;
    b.y += dy;
  }

  explode() {
    if (this.bullet !== null && this.bullet.expsn === 0) this.bullet.expsn = 1;
  }

  removeBullet() {
    if (this.bullet === null) return;
    spr.erasespr(FIRSTFIREBALL);
    this.bullet = null;
    this.bulletSpawned = -1;
  }

  label(frame, x, y, text) {
    outtext(text, x, y, 2);
  }

  gold(frame, x, y) {
    spr.movedrawspr(FIRSTBAG, x, y);
    drawgold(0, 0, x, y);
  }

  emerald(frame, x, y) {
    drawemerald(x, y);
  }

  bonus(frame, x, y) {
    drawbonus(x, y);
  }
}
