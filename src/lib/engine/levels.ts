// boards are dealt from a seed: level N always plays the same, the date is
// the daily, and a shared link is just a seed. every deal is played through by
// the bot with the capsules it will really hand out before anyone sees it; a
// deal the bot cannot clear is thrown away and the next variant is dealt.
import { HEIGHT, WIDTH, makeGrid, start, type Game } from './capsule.ts'
import { at, put, type Grid } from './fall.ts'
import { play } from './bot.ts'
import { rng } from './seed.ts'
import { COLORS, type Cell, type Color, type Speed } from './types.ts'

// four germs a level, the classic ramp, held at a jar a kid can still read
export const germCount = (level: number) => Math.min(4 * level, 84)
// germs live low in the jar; later levels reach higher
export const germRows = (level: number) => Math.min(13, 8 + Math.floor(level / 4))
export const LEVELS = 30
export const DAILY_LEVEL = 8
const VARIANTS = 50

// mixing seed, level and variant into one 32-bit seed for the rng
const mix = (...parts: number[]) =>
  parts.reduce((h, p) => Math.imul(h ^ (p >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5)

// three of a colour in a line at deal time is a gift; the classic deal never
// gives one, so no germ is placed where it would make a run of three
function runOfThree(g: Grid<Cell>, x: number, y: number, color: Color) {
  for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    let n = 1
    for (let k = 1; at(g, x + dx * k, y + dy * k)?.color === color; k++) n++
    for (let k = 1; at(g, x - dx * k, y - dy * k)?.color === color; k++) n++
    if (n >= 3) return true
  }
  return false
}

export function germs(seed: number, level: number): Grid<Cell> {
  const draw = rng(seed)
  const g = makeGrid<Cell>(WIDTH, HEIGHT)
  const top = HEIGHT - germRows(level)
  const want = germCount(level)
  let placed = 0
  for (let tries = 0; placed < want && tries < 5000; tries++) {
    const x = Math.floor(draw() * WIDTH)
    const y = top + Math.floor(draw() * (HEIGHT - top))
    if (at(g, x, y)) continue
    // colours take turns so every deal is balanced, then the next one that fits
    for (let k = 0; k < COLORS; k++) {
      const color = ((placed + k) % COLORS) as Color
      if (runOfThree(g, x, y, color)) continue
      put(g, x, y, { kind: 'germ', color })
      placed++
      break
    }
  }
  return g
}

export interface Deal {
  seed: number
  level: number
  variant: number
  germSeed: number
  capsuleSeed: number
}

const copy = (g: Grid<Cell>): Grid<Cell> => ({ ...g, cells: g.cells.map(c => (c ? { ...c } : null)) })

export function deal(seed: number, level: number): Deal {
  for (let variant = 0; variant < VARIANTS; variant++) {
    const germSeed = mix(seed, level, variant, 1)
    const capsuleSeed = mix(seed, level, variant, 2)
    const proof = play(start(copy(germs(germSeed, level)), level, capsuleSeed))
    if (proof.status === 'won') return { seed, level, variant, germSeed, capsuleSeed }
  }
  throw Error(`no clearable deal for seed ${seed} level ${level}`)
}

export const begin = (d: Deal, speed: Speed): Game => start(germs(d.germSeed, d.level), d.level, d.capsuleSeed, speed)

// campaign level N is seed N; the daily is the date at the daily level
export const campaign = (level: number) => deal(level, level)
export const daily = (dateSeed: number) => deal(dateSeed, DAILY_LEVEL)
