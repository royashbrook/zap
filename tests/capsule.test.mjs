import test from 'node:test'
import assert from 'node:assert/strict'
import { HEIGHT, WIDTH, drop, makeGrid, matches, move, resolve, rotate, settle, start, tick } from '../src/lib/engine/capsule.ts'
import { at, put } from '../src/lib/engine/fall.ts'

const germ = color => ({ kind: 'germ', color })
const half = (color, link = null) => ({ kind: 'half', color, link })
const jar = () => makeGrid(WIDTH, HEIGHT)
const B = HEIGHT - 1

test('four in a row clears, three does not, germs count', () => {
  const g = jar()
  for (let x = 0; x < 3; x++) put(g, x, B, germ(0))
  assert.deepEqual(matches(g), [], 'three is not a line')
  put(g, 3, B, half(0))
  const steps = resolve(g)
  assert.equal(steps.length, 1)
  assert.equal(steps[0].germs, 3)
  assert.equal(g.cells.filter(Boolean).length, 0)
  // vertical too, and a run of five clears all five
  for (let y = B - 4; y <= B; y++) put(g, 5, y, half(1))
  assert.equal(resolve(g)[0].cleared.length, 5)
})

test('a run never wraps from one row to the next', () => {
  const g = jar()
  put(g, 6, B - 1, half(2)), put(g, 7, B - 1, half(2)), put(g, 0, B, half(2)), put(g, 1, B, half(2))
  assert.deepEqual(matches(g), [])
})

test('loose halves fall, a pair falls only as a pair, germs never fall', () => {
  const g = jar()
  put(g, 0, 4, half(0)) // loose half in the air
  put(g, 2, 4, half(1, 'right')), put(g, 3, 4, half(2, 'left')) // horizontal pair
  put(g, 3, B, germ(0)) // holds the pair's right half up
  put(g, 5, 2, germ(1)) // a germ in the air stays put
  put(g, 6, 3, half(1, 'down')), put(g, 6, 4, half(2, 'up')) // vertical pair
  settle(g)
  assert.equal(at(g, 0, B)?.color, 0, 'the loose half reached the floor')
  assert.equal(at(g, 2, B - 1)?.link, 'right', 'the pair rests on the germ under its right half')
  assert.equal(at(g, 3, B - 1)?.link, 'left')
  assert.equal(at(g, 5, 2)?.kind, 'germ')
  assert.equal(at(g, 6, B)?.link, 'up', 'the vertical pair kept its order')
  assert.equal(at(g, 6, B - 1)?.link, 'down')
})

test('a clear frees the partner, which falls and can chain', () => {
  const g = jar()
  // red germs at the bottom of columns 0-2, a blue germ under column 4
  for (let x = 0; x < 3; x++) put(g, x, B, germ(0))
  put(g, 4, B, germ(1))
  // blue germs stacked in column 4 above it wait for one more blue
  put(g, 4, B - 1, germ(1)), put(g, 4, B - 2, germ(1))
  // a red/blue capsule lying over columns 3-4: red drops into the red line
  const game = start(g, 1, 1)
  game.active.colors = [0, 1]
  game.active.body.x = 3
  drop(game)
  // the pair rests at row B-3 on the blue stack: blue makes four and clears
  // three germs, the red half drops to (3, B) and clears the red line. a chain.
  assert.equal(game.last.length, 2, 'two steps: blue, then red')
  assert.deepEqual(game.last.map(s => s.germs), [3, 3])
  assert.equal(game.germs, 0)
  assert.equal(game.status, 'won')
})

test('the capsule turns against a wall by kicking off it', () => {
  const game = start(jar(), 1, 5)
  rotate(game) // vertical
  while (move(game, 1));
  assert.equal(game.active.body.x, WIDTH - 1)
  assert.ok(rotate(game), 'turning back to flat kicks it one left')
  assert.equal(game.active.body.x, WIDTH - 2)
})

test('calm never falls by itself; a speed falls and locks', () => {
  const calm = start(jar(), 1, 9, 'calm')
  for (let i = 0; i < 600; i++) tick(calm, 1 / 60)
  assert.equal(calm.capsules, 1, 'still the first capsule, waiting')
  // one germ, so the first lock is not already a win
  const one = jar()
  put(one, 0, B, germ(0))
  const fast = start(one, 1, 9, 'fast')
  for (let i = 0; i < 60 * 10; i++) tick(fast, 1 / 60)
  assert.ok(fast.capsules > 1, `it fell and locked, capsules=${fast.capsules}`)
})

test('a jar filled to the top loses when the next capsule has no room', () => {
  const g = jar()
  put(g, 3, 1, germ(2))
  assert.equal(start(g, 1, 3).status, 'lost')
})

// playtest round 1 (#3, #4): a stronger ramp, a lock delay, a soft drop that steers
import { LOCK_DELAY, MAX_RATE, MAX_RESETS, SOFT_RATE, nudge, rowsPerSecond, soften } from '../src/lib/engine/capsule.ts'

const run = (game, seconds, step = 1 / 60) => { for (let t = 0; t < seconds; t += step) tick(game, step) }
// a jar with one germ out of the way, so a lock is never a win
const quiet = () => { const g = jar(); put(g, 7, B, germ(2)); return g }

test('the ramp: faster each level and every ten capsules, never past the cap', () => {
  assert.ok(rowsPerSecond('slow', 2) > rowsPerSecond('slow', 1))
  assert.ok(rowsPerSecond('slow', 5, 10) > rowsPerSecond('slow', 5, 9))
  assert.equal(rowsPerSecond('calm', 30, 300), 0)
  assert.equal(rowsPerSecond('fast', 30, 300), MAX_RATE)
  assert.ok(rowsPerSecond('slow', 30, 300) <= 1.2 * 3)
})

test('a landed capsule waits LOCK_DELAY before it locks', () => {
  const game = start(quiet(), 1, 4, 'fast')
  game.active.body.y = B // flat on the floor
  run(game, LOCK_DELAY * 0.8)
  assert.equal(game.capsules, 1, 'still the same capsule, resting')
  run(game, LOCK_DELAY * 0.5)
  assert.equal(game.capsules, 2, 'locked, the next one appeared')
})

test('a resting capsule slides under an overhang before it locks', () => {
  const g = quiet()
  // a roof over columns 0-1, one row up from the floor, nothing under it
  put(g, 0, B - 1, germ(1)), put(g, 1, B - 1, germ(1))
  const game = start(g, 1, 4, 'fast')
  move(game, -1) // flat over columns 2-3, clear of the roof
  while (game.resting === null) tick(game, 1 / 60) // gravity brings it to the floor
  assert.equal(game.active.body.y, B)
  assert.ok(move(game, -1) && move(game, -1), 'slid along the floor, under the roof')
  run(game, LOCK_DELAY + 0.1)
  assert.equal(game.capsules, 2, 'then it locked')
  assert.equal(at(game.grid, 0, B)?.kind, 'half', 'locked under the roof')
  assert.equal(at(game.grid, 1, B)?.kind, 'half')
  assert.equal(at(game.grid, 0, B - 1)?.kind, 'germ', 'the roof is still there')
})

test('moves buy time only MAX_RESETS times, then it locks', () => {
  const game = start(quiet(), 1, 4, 'calm')
  game.active.body.y = B
  game.resting = 0
  for (let i = 0; i < MAX_RESETS; i++) {
    run(game, LOCK_DELAY * 0.6)
    move(game, i % 2 ? 1 : -1)
  }
  assert.equal(game.capsules, 1, 'fifteen moves kept it alive')
  run(game, LOCK_DELAY * 0.6)
  move(game, 1)
  run(game, LOCK_DELAY * 0.6)
  assert.equal(game.capsules, 2, 'the sixteenth move bought nothing')
})

test('soft drop falls at SOFT_RATE and steers; hard drop locks at once', () => {
  const game = start(quiet(), 1, 4, 'calm')
  soften(game, true)
  run(game, 0.25)
  const fell = game.active.body.y - 1
  assert.ok(fell >= SOFT_RATE * 0.25 - 1, `fell ${fell} rows in a quarter second`)
  assert.ok(move(game, -1), 'still steers while held')
  soften(game, false)
  const y = game.active.body.y
  run(game, 1)
  assert.equal(game.active.body.y, y, 'let go in calm: it waits again')
  drop(game)
  assert.equal(game.capsules, 2, 'hard drop locked it with no delay')
  // a nudge on the floor starts the rest instead of locking
  game.active.body.y = B
  nudge(game)
  assert.equal(game.capsules, 2)
  assert.equal(game.resting, 0)
})
