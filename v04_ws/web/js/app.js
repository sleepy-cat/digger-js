// The page: starts the game, and loads and saves recordings.

import { init, mainprog, play, playnet, onplayed, lastrecording, lastedrfrecording } from './main.js';
import * as netplay from './netplay.js';
import { parse } from './record.js';

const status = document.getElementById('status');
const file = document.getElementById('file');

async function load(f) {
  try {
    play(parse(await f.text()));
    status.textContent = `Playing ${f.name}. Esc stops it.`;
  } catch (e) {
    status.textContent = `${f.name}: ${e.message}`;
  }
}

// How a recording played back ended: an eDRF tells whether the game went
// as recorded.
onplayed((r) => {
  const score = `Played back: score ${r.score}, level ${r.level}, ${r.ticks} ticks.`;
  status.textContent = r.check === null ? score : `${score} Check: ${r.check.message}.`;
});

// Downloads the last game played, as an eDRF or a DRF.
function save(ext) {
  const text = ext === 'edrf' ? lastedrfrecording() : lastrecording();
  if (text === '') {
    status.textContent = 'No game played yet.';
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const when = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  a.download = `digger-${when}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Joins a network game in room: the other player joins the same room, by
// its name or the link to it.
function joinnet(room) {
  const link = new URL(location.href);
  link.search = `?room=${encodeURIComponent(room)}`;
  netplay.join(room, {
    wait() {
      status.textContent = `Waiting for the other player in room "${room}". ` +
        `They join it by its name, or with this link: ${link}`;
    },
    async start() {
      const side = netplay.net.me === 0 ? 'left' : 'right';
      status.textContent = `Network game: you are player ${netplay.net.me + 1}, ` +
        `your score is on the ${side}. Esc leaves the game.`;
      await playnet();
      status.textContent = 'The network game is over.';
    },
    left() {
      status.textContent = 'The other player has left the game.';
    },
    outofstep(tick) {
      status.textContent = `The two games went out of step on tick ${tick}!`;
    },
    error() {
      status.textContent = 'Could not connect to the server for the network game.';
    },
  });
}

function newroom() {
  const room = window.prompt('Room to play in (the other player joins the same one):',
    Math.random().toString(36).slice(2, 7));
  if (room) joinnet(room.trim());
}

function button(id, action) {
  document.getElementById(id).addEventListener('click', (e) => {
    e.currentTarget.blur(); // the keys are for the game
    action();
  });
}

button('net', newroom);
button('play', () => file.click());
button('save-edrf', () => save('edrf'));
button('save-drf', () => save('drf'));
file.addEventListener('change', () => {
  if (file.files.length > 0) load(file.files[0]);
  file.value = '';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'F8') save('edrf');
});
// Going to another page leaves a network game, it might not close by itself
window.addEventListener('pagehide', () => netplay.leave());
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) load(e.dataTransfer.files[0]);
});

await init(document.getElementById('screen'));
const room = new URLSearchParams(location.search).get('room');
if (room) joinnet(room);
await mainprog();
