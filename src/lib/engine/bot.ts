// a plain greedy player, the proof that a dealt board can be cleared with the
// capsules that board will really hand out. it only makes moves a kid can make:
// turn at the top, slide across, drop. no tucks, no lookahead past the capsule
// in hand.
import { at, shift, turn as turnBody } from './fall.ts'
import { HEIGHT, WIDTH, drop, type Game } from './capsule.ts'
import type { Cell } from './types.ts'

interface Plan {
  turn: number
  x: number
}

const clone = (game: Game): Game => ({
  ...game,
  grid: { ...game.grid, cells: game.grid.cells.map(c => (c ? { ...c } : null)) },
  active: game.active && { ...game.active, body: { ...game.active.body } },
  carry: { ...game.carry },
  // a lookahead must not spend the real capsule order
  draw: () => 0,
})

// walk the capsule to the plan the way fingers would; false if it can't get there
function reach(game: Game, plan: Plan) {
  const body = game.active!.body
  for (let t = 0; t < plan.turn; t++) if (!turnBody(game.grid, body, 1, [0])) return false
  while (body.x !== plan.x) if (!shift(game.grid, body, Math.sign(plan.x - body.x), 0)) return false
  return true
}

function score(before: Game, after: Game) {
  if (after.status === 'won') return 1e9
  if (after.status === 'lost') return -1e9
  const g = after.grid
  let value = (before.germs - after.germs) * 1000
  let top = HEIGHT
  for (let x = 0; x < WIDTH; x++) {
    const column: Cell[] = []
    for (let y = 0; y < HEIGHT; y++) {
      const c = at(g, x, y)
      if (c) column.push(c), (top = Math.min(top, y))
    }
    // every change of colour going down a column is one more thing in the way
    for (let i = 1; i < column.length; i++) if (column[i].color !== column[i - 1].color) value -= 10
    column.forEach((c, i) => {
      if (c.kind !== 'germ') return
      // the germ and the same colour sitting straight on it: that run is how
      // close this germ is to clearing. anything else above it buries it.
      let run = 1
      while (i - run >= 0 && column[i - run].color === c.color) run++
      value += run * run * 20
      value -= (i - run + 1) * 35
    })
  }
  // the top rows are where a capsule appears: keep them clear
  if (top < 5) value -= (5 - top) * 400
  return value
}

// every place this capsule can be walked to, played out on a copy
function outcomes(game: Game) {
  const out: { plan: Plan; after: Game }[] = []
  for (let turn = 0; turn < 4; turn++)
    for (let x = -1; x <= WIDTH; x++) {
      const after = clone(game)
      const plan = { turn, x }
      if (!reach(after, plan)) continue
      drop(after)
      out.push({ plan, after })
    }
  return out
}

// the next capsule shows in the window, so the bot may look at it too, as a
// kid can: each place for this one is judged by the best place for the next
export function choose(game: Game, depth = 2): Plan | null {
  let best: Plan | null = null
  let bestScore = -Infinity
  for (const { plan, after } of outcomes(game)) {
    let s = score(game, after)
    if (depth > 1 && after.status === 'playing')
      s = Math.max(...outcomes(after).map(o => score(game, o.after)), -1e9)
    if (s > bestScore) (bestScore = s), (best = plan)
  }
  return best
}

export function play(game: Game, limit = 400) {
  while (game.status === 'playing' && game.capsules <= limit) {
    const plan = choose(game)
    if (!plan || !reach(game, plan)) {
      drop(game)
      continue
    }
    drop(game)
  }
  return game
}

