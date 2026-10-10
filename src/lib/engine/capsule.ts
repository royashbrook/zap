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
}

// rows per second at each speed, before the level ramp. calm never falls on
// its own: the capsule waits until the player drops it.
const BASE: Record<Speed, number> = { calm: 0, slow: 1.2, medium: 2.2, fast: 3.4 }
export const rowsPerSecond = (speed: Speed, level: number) =>
  BASE[speed] * Math.min(2, 1 + 0.05 * (level - 1))

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
}

export const move = (game: Game, dx: -1 | 1) =>
  game.status === 'playing' && !!game.active && shift(game.grid, game.active.body, dx, 0)

export const rotate = (game: Game, by: 1 | -1 = 1) =>
  game.status === 'playing' && !!game.active && turnBody(game.grid, game.active.body, by)

// one row down by hand; on the floor it locks, like a gravity step would
export function nudge(game: Game) {
  if (game.status !== 'playing' || !game.active) return
  if (!shift(game.grid, game.active.body, 0, 1)) lock(game)
}

export function drop(game: Game) {
  if (game.status !== 'playing' || !game.active) return
  game.active.body.y = landing(game.grid, game.active.body)
  lock(game)
}

// gravity for real time. a capsule that cannot fall when gravity asks it to
// locks there; calm has no gravity, so it only locks when the player drops it.
export function tick(game: Game, seconds: number) {
  if (game.status !== 'playing' || !game.active) return
  const rate = rowsPerSecond(game.speed, game.level)
  if (rate === 0) return
  const before = game.carry.rows
  const { fell } = fall(game.grid, game.active.body, game.carry, rate, seconds)
  if (fell === 0 && before + rate * seconds >= 1) lock(game)
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
    for (const i of hit) g.cells[i] = null
    steps.push({ cleared: hit, germs })
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
