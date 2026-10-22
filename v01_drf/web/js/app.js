// The page: starts the game, and loads and saves recordings.

import { init, mainprog, play, lastrecording } from './main.js';
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

function save() {
  const drf = lastrecording();
  if (drf === '') {
    status.textContent = 'No game played yet.';
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([drf], { type: 'text/plain' }));
  a.download = `digger-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}.drf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('play').addEventListener('click', (e) => {
  e.currentTarget.blur(); // the keys are for the game
  file.click();
});
document.getElementById('save').addEventListener('click', (e) => {
  e.currentTarget.blur();
  save();
});
file.addEventListener('change', () => {
  if (file.files.length > 0) load(file.files[0]);
  file.value = '';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'F8') save();
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) load(e.dataTransfer.files[0]);
});

await init(document.getElementById('screen'));
await mainprog();
