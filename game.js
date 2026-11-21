'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const linesBefore = lines;
  clearLines();
  combo = lines > linesBefore ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  recordGame();
  overlay.classList.remove('hidden');
  if (newEntry) recordName.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  saveRecordName(); // conserva el nombre escrito si se reinicia sin pulsar Guardar
  newEntry = null;
  gameoverRecords.classList.add('hidden');
  overlayResetBtn.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Tema claro/oscuro (oscuro por defecto) ----
const themeToggle = document.getElementById('theme-toggle');
const themeText = document.getElementById('theme-text');
const THEME_KEY = 'tetris-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeText.textContent = isLight ? 'Claro' : 'Oscuro';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  // Redibujar si el loop no está corriendo (pausa / game over)
  if (board && current && (paused || gameOver)) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  applyTheme(theme);
  themeToggle.blur(); // evita que Space/Enter activen el botón durante la partida
});

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (_) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

// ---- Récords (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const startScreen = document.getElementById('start-screen');
const gameoverRecords = document.getElementById('gameover-records');
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');
const overlayResetBtn = overlay.querySelector('.reset-records-btn');

let combo = 0;
let maxCombo = 0;
let newEntry = null; // fila del top 5 de la partida recién terminada (para resaltarla)
let records = loadRecords();

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.top)) return emptyRecords();
    const top = data.top
      .filter(e => e && Number.isFinite(e.score))
      .map(e => ({
        name: String(e.name ?? '').slice(0, 12) || 'Anónimo',
        score: e.score,
        lines: Number(e.lines) || 0,
        combo: Number(e.combo) || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { top, bestCombo: Number(data.bestCombo) || 0, maxLines: Number(data.maxLines) || 0 };
  } catch (_) {
    return emptyRecords();
  }
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (_) {}
}

// Se guarda al instante como "Anónimo" para no perder el récord si no se escribe nombre
function recordGame() {
  records = loadRecords(); // releer por si otra pestaña guardó récords
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  const top = records.top;
  if (score > 0 && (top.length < 5 || score > top[top.length - 1].score)) {
    newEntry = { name: 'Anónimo', score, lines, combo: maxCombo };
    top.push(newEntry);
    top.sort((a, b) => b.score - a.score);
    top.splice(5);
  }
  saveRecords();
  renderRecords();
  recordName.value = '';
  recordForm.classList.toggle('hidden', !newEntry);
  gameoverRecords.classList.remove('hidden');
  overlayResetBtn.classList.remove('hidden');
}

function renderRecords() {
  for (const el of document.querySelectorAll('.records')) {
    const parts = [];
    if (records.top.length) {
      const table = document.createElement('table');
      const head = table.createTHead().insertRow();
      for (const h of ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo']) {
        const th = document.createElement('th');
        th.textContent = h;
        head.append(th);
      }
      const body = table.createTBody();
      records.top.forEach((e, i) => {
        const tr = body.insertRow();
        if (e === newEntry) tr.className = 'highlight';
        for (const v of [i + 1, e.name, e.score.toLocaleString(), e.lines, e.combo])
          tr.insertCell().textContent = v;
      });
      parts.push(table);
    } else {
      const p = document.createElement('p');
      p.className = 'records-empty';
      p.textContent = 'Sin récords todavía';
      parts.push(p);
    }
    const best = document.createElement('p');
    best.className = 'records-best';
    best.textContent = `Mejor combo: ${records.bestCombo} · Líneas máx.: ${records.maxLines}`;
    parts.push(best);
    el.replaceChildren(...parts);
  }
}

// ponytail: el nombre se escribe sobre la copia en memoria; si otra pestaña guarda
// mientras el formulario está abierto, se pisa. Releer y buscar la fila si importa.
function saveRecordName() {
  if (!newEntry || recordForm.classList.contains('hidden')) return;
  newEntry.name = recordName.value.trim() || 'Anónimo';
  saveRecords();
  renderRecords();
  recordForm.classList.add('hidden');
}

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  saveRecordName();
});

// Espacios iniciales (p. ej. Space mantenido al perder) no gastan el maxlength
recordName.addEventListener('input', () => {
  const v = recordName.value.trimStart();
  if (v !== recordName.value) recordName.value = v;
});

for (const btn of document.querySelectorAll('.reset-records-btn')) {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Borrar todos los récords?')) return;
    records = emptyRecords();
    newEntry = null;
    recordForm.classList.add('hidden');
    saveRecords();
    renderRecords();
  });
}

document.getElementById('play-btn').addEventListener('click', e => {
  e.currentTarget.blur();
  startScreen.classList.add('hidden');
  init();
});

// Pantalla de inicio: sin partida activa hasta pulsar "Jugar"
gameOver = true;
renderRecords();
