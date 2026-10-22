// The page: starts the game, and loads and saves recordings.

import { init, mainprog, play, onplayed, lastrecording, lastedrfrecording } from './main.js';
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

function button(id, action) {
  document.getElementById(id).addEventListener('click', (e) => {
    e.currentTarget.blur(); // the keys are for the game
    action();
  });
}

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
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) load(e.dataTransfer.files[0]);
});

await init(document.getElementById('screen'));
await mainprog();
