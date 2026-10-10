// the falling-piece core: a grid, a body made of cells, and the moves every
// falling-block game shares (step, slide, turn with a kick, settle). it knows
// nothing about capsules or germs, so the next game (the tetris one) lifts it
// as it is and brings its own shapes.

export interface Grid<C> {
  width: number
  height: number
  // row-major, row 0 is the top; null is empty
  cells: (C | null)[]
}

export type Offset = readonly [dx: number, dy: number]

// a body is where a piece sits (x, y), which of its turns it is in, and the
// cell offsets of every turn. offsets are relative to (x, y), dy grows down.
export interface Body {
  x: number
  y: number
  turn: number
  turns: readonly (readonly Offset[])[]
}

export function makeGrid<C>(width: number, height: number): Grid<C> {
  return { width, height, cells: Array(width * height).fill(null) }
}

// off the grid reads as empty, never as the next row round
export const at = <C>(g: Grid<C>, x: number, y: number): C | null =>
  inside(g, x, y) ? (g.cells[y * g.width + x] ?? null) : null

export function put<C>(g: Grid<C>, x: number, y: number, c: C | null) {
  g.cells[y * g.width + x] = c
}

export const inside = (g: Grid<unknown>, x: number, y: number) =>
  x >= 0 && x < g.width && y >= 0 && y < g.height

export const cellsOf = (b: Body, turn = b.turn, x = b.x, y = b.y): Offset[] =>
  b.turns[turn].map(([dx, dy]) => [x + dx, y + dy] as const)

export function fits(g: Grid<unknown>, b: Body, turn = b.turn, x = b.x, y = b.y) {
  return cellsOf(b, turn, x, y).every(([cx, cy]) => inside(g, cx, cy) && at(g, cx, cy) === null)
}

// one cell in a direction, or nothing; returns whether it moved
export function shift(g: Grid<unknown>, b: Body, dx: number, dy: number) {
  if (!fits(g, b, b.turn, b.x + dx, b.y + dy)) return false
  b.x += dx
  b.y += dy
  return true
}

// turn in place, else nudge one cell left, then right: the kick that lets a
// piece turn against a wall instead of refusing. the order is the house rule,
// and a game that wants a bigger kick table passes its own.
export function turn(g: Grid<unknown>, b: Body, by = 1, kicks: readonly number[] = [0, -1, 1]) {
  const next = (b.turn + by + b.turns.length) % b.turns.length
  for (const dx of kicks)
    if (fits(g, b, next, b.x + dx, b.y)) {
      b.turn = next
      b.x += dx
      return true
    }
  return false
}

// the row the piece would rest on if dropped straight down
export function landing(g: Grid<unknown>, b: Body) {
  let y = b.y
  while (fits(g, b, b.turn, b.x, y + 1)) y++
  return y
}

// gravity as an accumulator: rows per second times elapsed seconds, so the
// fall is the same at 30 or 120 frames a second. returns rows actually fallen
// and whether the piece is now resting (the caller decides when to lock).
export function fall(g: Grid<unknown>, b: Body, carry: { rows: number }, rowsPerSecond: number, seconds: number) {
  carry.rows += rowsPerSecond * seconds
  let fell = 0
  while (carry.rows >= 1) {
    carry.rows -= 1
    if (!shift(g, b, 0, 1)) {
      carry.rows = 0
      break
    }
    fell++
  }
  return { fell, resting: !fits(g, b, b.turn, b.x, b.y + 1) }
}
