// the deals table: which variant of each campaign level and each daily the bot
// proved it can clear. `write` searches and saves it; `verify` re-proves every
// entry and fails the build if one no longer clears (an engine change can do that).
import { readFile, writeFile } from 'node:fs/promises'
import { DAILY_LEVEL, LEVELS, deal, dealFor, proven } from '../src/lib/engine/levels.ts'

const FILE = new URL('../src/lib/engine/deals.json', import.meta.url)
export const FIRST_DAY = new Date(2026, 9, 1)
export const DAYS = 365 * 3 + 1
export const dateSeed = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
export function* days() {
  for (let i = 0; i < DAYS; i++) yield dateSeed(new Date(FIRST_DAY.getFullYear(), FIRST_DAY.getMonth(), FIRST_DAY.getDate() + i))
}

const mode = process.argv[2]
if (mode === 'write') {
  const table = { campaign: {}, daily: {} }
  for (let level = 1; level <= LEVELS; level++) {
    table.campaign[level] = deal(level, level).variant
    console.log(`level ${level}: variant ${table.campaign[level]}`)
  }
  for (const seed of days()) table.daily[seed] = deal(seed, DAILY_LEVEL).variant
  await writeFile(FILE, JSON.stringify(table) + '\n')
  console.log(`wrote ${LEVELS} levels and ${DAYS} dailies`)
} else if (mode === 'verify') {
  const table = JSON.parse(await readFile(FILE, 'utf8'))
  const failed = []
  for (let level = 1; level <= LEVELS; level++)
    if (!(level in table.campaign) || !proven(dealFor(level, level, table.campaign[level]))) failed.push(`level ${level}`)
  for (const seed of days())
    if (!(seed in table.daily) || !proven(dealFor(seed, DAILY_LEVEL, table.daily[seed]))) failed.push(`daily ${seed}`)
  if (failed.length) throw Error(`deals no longer proven: ${failed.join(', ')}`)
  console.log(`verified ${LEVELS} levels and ${DAYS} dailies`)
} else if (mode) throw Error('usage: deals.mjs write|verify')
