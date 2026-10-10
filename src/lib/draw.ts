// the jar as one svg string: the grid, the pieces in it, where the capsule in
// hand would land, the capsule itself, and any pops from the last clear. one
// string per frame keeps a cheap phone fast and keeps every piece of art in
// the look, never in the component.
import { at } from './engine/fall.ts'
import { HEIGHT, WIDTH, ghost, type Game } from './engine/capsule.ts'
import type { Color, Link } from './engine/types.ts'
import type { Look } from './skins.ts'

export const CELL = 100
const LINKS: readonly (readonly [Link, Link])[] = [
  ['right', 'left'],
  ['up', 'down'],
  ['left', 'right'],
  ['down', 'up'],
]

// the position lives on an outer group: a css animation sets transform on its
// own element, and on this one it would wipe the translate and stack every
// piece in the corner
const place = (x: number, y: number, art: string, extra = '') =>
  `<g transform="translate(${x * CELL} ${y * CELL})"><g${extra}>${art}</g></g>`

export interface Pop {
  i: number
  color: Color
  // a germ pops with a surprised face; a capsule half just bursts
  germ?: boolean
}

export function jar(game: Game, look: Look, pops: Pop[] = []) {
  const out: string[] = [
    `<rect x="0" y="0" width="${WIDTH * CELL}" height="${HEIGHT * CELL}" rx="40" fill="${look.jar.fill}"/>`,
  ]
  for (let x = 1; x < WIDTH; x++)
    out.push(`<path d="M${x * CELL} 0V${HEIGHT * CELL}" stroke="${look.jar.grid}" stroke-width="4"/>`)
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const c = at(game.grid, x, y)
      if (!c) continue
      out.push(place(x, y, c.kind === 'germ' ? look.germ(c.color) : look.half(c.color, c.link), c.kind === 'germ' ? ' class="piece germ"' : ' class="piece"'))
    }
  const active = game.active
  if (active) {
    const { body, colors } = active
    const land = ghost(game)!
    if (land !== body.y)
      for (const [dx, dy] of body.turns[body.turn])
        out.push(
          `<rect x="${(body.x + dx) * CELL + 12}" y="${(land + dy) * CELL + 12}" width="${CELL - 24}" height="${CELL - 24}" rx="30" fill="none" stroke="${look.jar.edge}" stroke-opacity=".45" stroke-width="6" stroke-dasharray="14 10" class="ghost"/>`,
        )
    body.turns[body.turn].forEach(([dx, dy], i) =>
      out.push(place(body.x + dx, body.y + dy, look.half(colors[i], LINKS[body.turn][i]), ' class="piece active"')),
    )
  }
  for (const p of pops)
    out.push(
      p.germ
        ? place(p.i % WIDTH, Math.floor(p.i / WIDTH), look.germ(p.color, true), ' class="pop surprised"')
        : `<circle cx="${(p.i % WIDTH) * CELL + CELL / 2}" cy="${Math.floor(p.i / WIDTH) * CELL + CELL / 2}" r="44" fill="${look.colors[p.color][0]}" class="pop"/>`,
    )
  out.push(`<rect x="2" y="2" width="${WIDTH * CELL - 4}" height="${HEIGHT * CELL - 4}" rx="40" fill="none" stroke="${look.jar.edge}" stroke-width="8"/>`)
  return out.join('')
}

// the capsule waiting its turn, lying flat in the window
export const preview = (colors: readonly [Color, Color], look: Look) =>
  place(0, 0, look.half(colors[0], 'right')) + place(1, 0, look.half(colors[1], 'left'))
