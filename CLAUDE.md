# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JS + HTML5 Canvas. Three static files (`index.html`, `style.css`, `game.js`), no `package.json`, no build, no tests, no linter. UI text and README are in Spanish.

## Running

Open `index.html` directly, or serve statically: `python -m http.server 8000` (or `npx serve .`) and visit `http://localhost:8000`. Verification is manual in the browser.

## Architecture (`game.js`, single script, global state)

- All state lives in top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). `init()` resets all of them and is also the restart handler.
- `board` is a `ROWS × COLS` matrix; `0` = empty, `1–7` = index into `COLORS`/`PIECES` (index 0 of both is `null`). A piece is `{type, shape, x, y}` where `shape` is a matrix holding its own color index, so `merge()` and `drawBlock()` need no type lookup.
- Piece flow: `randomPiece()` → `next` → `spawn()` (moves `next` to `current`, creates new `next`, ends game if spawn collides) → `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. Hard drop, soft drop and the gravity tick in `loop()` all converge on `lockPiece()`.
- `loop(ts)` is a `requestAnimationFrame` loop that accumulates `dropAccum` and applies gravity when it reaches `dropInterval`; input is handled separately in one `keydown` listener. Pause/game-over work by `cancelAnimationFrame(animId)` + showing `#overlay`.
- Rotation is `rotateCW` (transpose + reverse) with a simple horizontal kick list `[0,-1,1,-2,2]` in `tryRotate` (not SRS).
- Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 − (level−1)·90)` is recomputed in `clearLines()`.

## Gotchas

- Canvas size is hardcoded in `index.html` (`#board` 300×600, `#next-canvas` 120×120). Changing `COLS`/`ROWS`/`BLOCK` in `game.js` requires updating those attributes (`COLS×BLOCK` by `ROWS×BLOCK`).
- The next-piece preview uses its own `NB = 30` block size inside `drawNext()`, independent of `BLOCK`.
- `endGame()` calls `cancelAnimationFrame(animId)`, but when game over is triggered from inside `loop()` (gravity lock), the cancel runs before `loop` reaches its last line. That line is guarded with `if (!gameOver)` so the loop doesn't reschedule itself; keep that guard when touching the loop/game-over flow.
