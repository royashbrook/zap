// the capsule game's rules on top of the falling-piece core: two-half
// capsules drop into the jar, four of one colour in a line clears, loose
// halves fall, and a fall that makes another line is a chain. germs never
// fall. clear every germ to win; a capsule with no room to appear ends it.
import { at, fall, fits, landing, makeGrid, put, shift, turn as turnBody, type Body, type Grid } from './fall.ts'
import { rng } from './seed.ts'
import { COLORS, type Cell, type Color, type Link, type Random, type Speed } from './types.ts'

export const WIDTH = 8
export const HEIGHT = 16
export const RUN = 4
// the capsule appears one row down, so a vertical turn has room at the top
const SPAWN = { x: 3, y: 1 }

// half a is cell 0, half b is cell 1. the turns walk a capsule round the way
// the classic one goes: a on the left, b on top, b on the left, a on top.
const TURNS = [
  [[0, 0], [1, 0]],
  [[0, 0], [0, -1]],
  [[1, 0], [0, 0]],
  [[0, -1], [0, 0]],
] as const
const LINKS: readonly (readonly [Link, Link])[] = [
  ['right', 'left'],
  ['up', 'down'],
  ['left', 'right'],
  ['down', 'up'],
]

export interface Capsule {
  body: Body
  colors: readonly [Color, Color]
}

// what a lock did, in order, so the screen can play it back: each chain step
// clears some cells, then some pieces fall
export interface Step {
  cleared: number[]
  // the colour of each cleared cell, in the same order, so the screen can pop it
  colors: Color[]
  // whether each cleared cell was a germ, so a germ can look surprised as it pops
  kinds: Cell['kind'][]
  germs: number
}

export interface Game {
  grid: Grid<Cell>
  level: number
  speed: Speed
  germs: number
  active: Capsule | null
  next: readonly [Color, Color]
  status: 'playing' | 'won' | 'lost'
  score: number
  capsules: number
  last: Step[]
  carry: { rows: number }
  draw: Random
  // held down: the capsule falls fast and still steers
  soft: boolean
  // seconds the capsule has rested on something, null while it can still fall
  resting: number | null
  // how many times a move or turn has given a resting capsule more time
  resets: number
}

// a capsule that lands gets half a second before it locks, so it can still be
// slid under an overhang or turned into a gap. each move or turn while it rests
// starts the half second again, up to fifteen times, then it locks anyway.
export const LOCK_DELAY = 0.5
export const MAX_RESETS = 15
// rows per second while the drop control is held
export const SOFT_RATE = 12

// rows per second at each speed, before the ramp. calm never falls on its own:
// the capsule waits until the player brings it down.
const BASE: Record<Speed, number> = { calm: 0, slow: 1.2, medium: 2.2, fast: 3.4 }
// the ramp, tetris style: each level is 12% faster than the one before, and
// every ten capsules in a level adds 3% more. the ramp tops out at three times
// the base, and nothing ever falls faster than 8 rows a second, so level 30 on
// fast is quick but still something a kid can steer.
export const MAX_RATE = 8
export const rowsPerSecond = (speed: Speed, level: number, capsules = 0) =>
  Math.min(MAX_RATE, BASE[speed] * Math.min(3, (1 + 0.12 * (level - 1)) * (1 + 0.03 * Math.floor(capsules / 10))))

const pair = (draw: Random): [Color, Color] => [
  Math.floor(draw() * COLORS) as Color,
  Math.floor(draw() * COLORS) as Color,
]

export function start(grid: Grid<Cell>, level: number, capsuleSeed: number, speed: Speed = 'calm'): Game {
  const draw = rng(capsuleSeed)
  const game: Game = {
    grid,
    level,
    speed,
    germs: grid.cells.filter(c => c?.kind === 'germ').length,
    active: null,
    next: pair(draw),
    status: 'playing',
    score: 0,
    capsules: 0,
    last: [],
    carry: { rows: 0 },
    draw,
    soft: false,
    resting: null,
    resets: 0,
  }
  spawn(game)
  return game
}

function spawn(game: Game) {
  const body: Body = { ...SPAWN, turn: 0, turns: TURNS }
  if (!fits(game.grid, body)) {
    game.active = null
    game.status = 'lost'
    return
  }
  game.active = { body, colors: game.next }
  game.next = pair(game.draw)
  game.capsules++
  game.resting = null
  game.resets = 0
}

// a move or turn on a resting capsule buys it another half second, a few times
function moved(game: Game, ok: boolean) {
  if (ok && game.resting !== null && game.resets < MAX_RESETS) {
    game.resting = 0
    game.resets++
  }
  return ok
}

export const move = (game: Game, dx: -1 | 1) =>
  game.status === 'playing' && !!game.active && moved(game, shift(game.grid, game.active.body, dx, 0))

export const rotate = (game: Game, by: 1 | -1 = 1) =>
  game.status === 'playing' && !!game.active && moved(game, turnBody(game.grid, game.active.body, by))

// hold or let go of the drop control; the next tick does the falling
export function soften(game: Game, on: boolean) {
  game.soft = on
  if (!on) game.carry.rows = 0
}

// one row down by hand. on the floor it starts resting rather than locking,
// so it still gets its half second, like a capsule gravity brought down
export function nudge(game: Game) {
  if (game.status !== 'playing' || !game.active) return
  if (!shift(game.grid, game.active.body, 0, 1) && game.resting === null) game.resting = 0
}

export function drop(game: Game) {
  if (game.status !== 'playing' || !game.active) return
  game.active.body.y = landing(game.grid, game.active.body)
  lock(game)
}

// real time: gravity (or a held drop) brings the capsule down, and once it rests
// on something it locks after LOCK_DELAY unless a move or turn buys it more.
// calm has no gravity, so a calm capsule only comes down while the drop is held.
export function tick(game: Game, seconds: number) {
  if (game.status !== 'playing' || !game.active) return
  const body = game.active.body
  const gravity = rowsPerSecond(game.speed, game.level, game.capsules)
  const rate = game.soft ? Math.max(SOFT_RATE, gravity) : gravity
  if (rate > 0) fall(game.grid, body, game.carry, rate, seconds)
  if (fits(game.grid, body, body.turn, body.x, body.y + 1)) {
    // slid off its ledge, or still in the air: it falls again
    game.resting = null
    return
  }
  if (game.resting === null) {
    game.resting = 0
    return
  }
  game.resting += seconds
  if (game.resting >= LOCK_DELAY) lock(game)
}

export function ghost(game: Game) {
  return game.active ? landing(game.grid, game.active.body) : null
}

function lock(game: Game) {
  const capsule = game.active!
  const { body, colors } = capsule
  body.turns[body.turn].forEach(([dx, dy], i) =>
    put(game.grid, body.x + dx, body.y + dy, { kind: 'half', color: colors[i], link: LINKS[body.turn][i] }),
  )
  game.active = null
  game.carry.rows = 0
  game.resting = null
  game.last = resolve(game.grid)
  const germs = game.last.reduce((n, s) => n + s.germs, 0)
  game.germs -= germs
  // a chain doubles what each germ is worth, step by step
  game.last.forEach((s, i) => (game.score += s.germs * 100 * 2 ** i))
  if (game.germs === 0) game.status = 'won'
  else spawn(game)
}

const PARTNER: Record<Exclude<Link, null>, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

// every cell in a straight run of RUN or more of one colour, germs included
export function matches(g: Grid<Cell>): number[] {
  const hit = new Set<number>()
  for (const [dx, dy] of [[1, 0], [0, 1]] as const)
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const c = at(g, x, y)
        if (!c) continue
        const px = x - dx, py = y - dy
        if (px >= 0 && py >= 0 && at(g, px, py)?.color === c.color) continue // not a run start
        let n = 1
        while (at(g, x + dx * n, y + dy * n)?.color === c.color) n++
        if (n >= RUN) for (let k = 0; k < n; k++) hit.add((y + dy * k) * g.width + x + dx * k)
      }
  return [...hit].sort((a, b) => a - b)
}

// clear, settle, look again, until nothing more clears
export function resolve(g: Grid<Cell>): Step[] {
  const steps: Step[] = []
  for (let hit = matches(g); hit.length; hit = matches(g)) {
    let germs = 0
    for (const i of hit) {
      const c = g.cells[i]!
      if (c.kind === 'germ') germs++
      else if (c.link) {
        const [dx, dy] = PARTNER[c.link]
        const p = at(g, (i % g.width) + dx, Math.floor(i / g.width) + dy)
        if (p?.kind === 'half') p.link = null
      }
    }
    const colors = hit.map(i => g.cells[i]!.color)
    const kinds = hit.map(i => g.cells[i]!.kind)
    for (const i of hit) g.cells[i] = null
    steps.push({ cleared: hit, colors, kinds, germs })
    settle(g)
  }
  return steps
}

// loose halves and whole capsules fall until everything rests on something.
// a pair falls only when both halves can, so it stays a pair.
export function settle(g: Grid<Cell>) {
  for (let moved = true; moved; ) {
    moved = false
    for (let y = g.height - 2; y >= 0; y--)
      for (let x = 0; x < g.width; x++) {
        const c = at(g, x, y)
        if (c?.kind !== 'half') continue
        if (c.link === 'left' || c.link === 'down') continue // its partner moves the pair
        const free = (cx: number, cy: number) => cy < g.height && at(g, cx, cy) === null
        if (c.link === null && free(x, y + 1)) {
          put(g, x, y + 1, c), put(g, x, y, null), (moved = true)
        } else if (c.link === 'right' && free(x, y + 1) && free(x + 1, y + 1)) {
          const p = at(g, x + 1, y)
          put(g, x, y + 1, c), put(g, x + 1, y + 1, p), put(g, x, y, null), put(g, x + 1, y, null)
          moved = true
        } else if (c.link === 'up' && free(x, y + 1)) {
          // c is the bottom half; its partner sits above
          const p = at(g, x, y - 1)
          put(g, x, y + 1, c), put(g, x, y, p), put(g, x, y - 1, null)
          moved = true
        }
      }
  }
}

export { makeGrid }
