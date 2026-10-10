import test from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_LEVEL, LEVELS, campaign, daily, dealFor, germCount, germs, proven } from '../src/lib/engine/levels.ts'
import { WIDTH, HEIGHT } from '../src/lib/engine/capsule.ts'
import { at } from '../src/lib/engine/fall.ts'
import table from '../src/lib/engine/deals.json' with { type: 'json' }

test('a deal is the same every time, with the right germ count and no run of three', () => {
  for (const level of [1, 7, 20]) {
    const d = dealFor(level, level, 0)
    const a = germs(d.germSeed, level), b = germs(d.germSeed, level)
    assert.deepEqual(a, b)
    assert.equal(a.cells.filter(Boolean).length, germCount(level))
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const c = at(a, x, y)
        if (!c) continue
        for (const [dx, dy] of [[1, 0], [0, 1]])
          assert.ok(!(at(a, x + dx, y + dy)?.color === c.color && at(a, x + 2 * dx, y + 2 * dy)?.color === c.color), `run of three at ${x},${y}`)
      }
  }
})

test('the table covers every level and three years of dailies', () => {
  assert.equal(Object.keys(table.campaign).length, LEVELS)
  assert.equal(Object.keys(table.daily).length, 1096)
  assert.ok('20261001' in table.daily && '20290930' in table.daily)
})

test('a sample of the table still clears (npm run verify re-proves all of it)', () => {
  for (const level of [1, 15, 26]) assert.ok(proven(dealFor(level, level, table.campaign[level])), `level ${level}`)
  for (const seed of [20261010, 20271225]) assert.ok(proven(dealFor(seed, DAILY_LEVEL, table.daily[seed])), `daily ${seed}`)
})

test('a phone looks the deal up instead of running the bot', () => {
  // level 26 took seven tries to prove; a search would take seconds
  const started = performance.now()
  const d = campaign(26)
  assert.ok(performance.now() - started < 50, `looked up, not searched (${Math.round(performance.now() - started)}ms)`)
  assert.equal(d.variant, table.campaign[26])
  const day = daily(20261010)
  assert.equal(day.variant, table.daily[20261010])
  assert.equal(day.level, DAILY_LEVEL)
})
