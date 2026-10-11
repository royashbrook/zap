// looks: total reskins of the jar, orthogonal to the engine. a look owns what
// the capsules and germs ARE and what the jar looks like; the rules never know
// which look is on. the capsule always stays a two-half capsule.
//
// every piece is drawn in a 100x100 cell. a half is drawn with its partner to
// the right and turned to face wherever its partner really is, so two halves
// read as one joined capsule in any turn.
//
// colourblind rule: every colour carries the same mark in every look. colour 0
// is a circle, colour 1 a triangle, colour 2 a square.
import type { Color, Link } from './engine/types.ts'
import { readSlot, writeSlot } from './storage.ts'

export interface Look {
  key: string
  title: string
  // per colour: body, shade, and the mark's ink
  colors: readonly [string, string, string][]
  jar: { fill: string; edge: string; grid: string }
  half: (color: Color, link: Link) => string
  // germs look happy; surprised only in the instant they pop
  germ: (color: Color, surprised?: boolean) => string
}

// a smile, or a small round "oh" while popping
const mouth = (cx: number, cy: number, w: number, surprised: boolean, ink = '#222') =>
  surprised
    ? `<ellipse class="mouth oh" cx="${cx}" cy="${cy + 2}" rx="${w * 0.35}" ry="${w * 0.45}" fill="${ink}"/>`
    : `<path class="mouth smile" d="M${cx - w} ${cy}Q${cx} ${cy + w * 0.9} ${cx + w} ${cy}" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`

export function mark(color: Color, cx: number, cy: number, r: number, fill: string) {
  if (color === 0) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
  if (color === 1)
    return `<path d="M${cx} ${cy - r * 1.1}L${cx + r * 1.1} ${cy + r * 0.8}H${cx - r * 1.1}Z" fill="${fill}"/>`
  return `<rect x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.2}" fill="${fill}"/>`
}

const TURN: Record<Exclude<Link, null>, number> = { right: 0, down: 90, left: 180, up: 270 }
// draw facing right, then turn to the real partner; a loose half stays unturned
const facing = (link: Link, body: string, loose: string) =>
  link === null ? loose : `<g transform="rotate(${TURN[link]} 50 50)">${body}</g>`

// the classic half: round at the far end, flat where it meets its partner
const HALF = 'M100 10H50A40 40 0 0 0 50 90H100Z'

const classic: Look = {
  key: 'classic',
  title: 'Classic',
  colors: [
    ['#E5484D', '#B3262B', '#FFE3E3'],
    ['#F5B82E', '#C98A0B', '#5A3D00'],
    ['#3FA7D6', '#1F6F97', '#E3F4FF'],
  ],
  jar: { fill: '#FFFDF7', edge: '#3D3230', grid: '#F1E8D8' },
  half(color, link) {
    const [body, shade, ink] = this.colors[color]
    const piece = `<path d="${HALF}" fill="${body}" stroke="${shade}" stroke-width="5"/><path d="M58 22H96" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/>`
    const loose = `<circle cx="50" cy="50" r="40" fill="${body}" stroke="${shade}" stroke-width="5"/>`
    return facing(link, piece, loose) + mark(color, 50, 52, 13, ink)
  },
  germ(color, surprised = false) {
    const [body, shade, ink] = this.colors[color]
    const bumps = [0, 60, 120, 180, 240, 300]
      .map(a => `<circle cx="${50 + 38 * Math.cos((a * Math.PI) / 180)}" cy="${52 + 34 * Math.sin((a * Math.PI) / 180)}" r="9" fill="${body}"/>`)
      .join('')
    return `${bumps}<ellipse cx="50" cy="52" rx="36" ry="32" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="37" cy="44" r="7" fill="#fff"/><circle cx="63" cy="44" r="7" fill="#fff"/><circle cx="38" cy="45" r="3.5" fill="#222"/><circle cx="62" cy="45" r="3.5" fill="#222"/>${mouth(50, 55, 9, surprised)}${mark(color, 50, 72, 8, ink)}`
  },
}

const space: Look = {
  key: 'space',
  title: 'Space',
  colors: [
    ['#FF5FA2', '#B8236A', '#FFE6F1'],
    ['#C6F04A', '#7FA316', '#2B3A00'],
    ['#4FE3F0', '#1B98A6', '#04363B'],
  ],
  jar: { fill: '#141A33', edge: '#9AA7FF', grid: '#1E2747' },
  half(color, link) {
    const [body, shade, ink] = this.colors[color]
    // the far end is a nose cone, the joint end carries a fin
    const piece = `<path d="M100 14H48Q16 14 6 50Q16 86 48 86H100Z" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="44" cy="50" r="9" fill="#141A33" stroke="#fff" stroke-width="3"/><path d="M78 14L90 2V14Z M78 86L90 98V86Z" fill="${shade}"/>`
    const loose = `<circle cx="50" cy="50" r="40" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="50" cy="50" r="10" fill="#141A33" stroke="#fff" stroke-width="3"/>`
    return facing(link, piece, loose) + mark(color, 68, 52, 9, ink)
  },
  germ(color, surprised = false) {
    const [body, shade, ink] = this.colors[color]
    return `<path d="M34 26L26 8M66 26L74 8" stroke="${shade}" stroke-width="5" stroke-linecap="round"/><circle cx="26" cy="8" r="6" fill="${body}"/><circle cx="74" cy="8" r="6" fill="${body}"/><path d="M14 58Q12 22 50 20Q88 22 86 58Q88 92 70 86Q60 96 50 86Q40 96 30 86Q12 92 14 58Z" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="50" cy="42" r="14" fill="#fff"/><circle cx="52" cy="44" r="7" fill="#141A33"/>${mouth(50, 61, 9, surprised, '#141A33')}${mark(color, 50, 78, 7, ink)}`
  },
}

const garden: Look = {
  key: 'garden',
  title: 'Garden',
  colors: [
    ['#F0614B', '#B43A28', '#FFF0E8'],
    ['#FFC93C', '#C99400', '#4A3500'],
    ['#9B7BEA', '#6447B8', '#F3EEFF'],
  ],
  jar: { fill: '#EAF6DC', edge: '#5B7A3A', grid: '#D7EBC2' },
  half(color, link) {
    const [body, shade, ink] = this.colors[color]
    // a seed pod: a leafy oval end with a vein running to the joint
    const piece = `<path d="M100 12H56Q8 12 8 50Q8 88 56 88H100Z" fill="${body}" stroke="${shade}" stroke-width="5"/><path d="M18 50H98" stroke="${shade}" stroke-width="3" stroke-opacity=".6"/><path d="M40 50L30 36M40 50L30 64M66 50L58 34M66 50L58 66" stroke="${shade}" stroke-width="3" stroke-opacity=".6" stroke-linecap="round"/>`
    const loose = `<ellipse cx="50" cy="50" rx="40" ry="38" fill="${body}" stroke="${shade}" stroke-width="5"/>`
    return facing(link, piece, loose) + mark(color, 78, 50, 9, ink)
  },
  germ(color, surprised = false) {
    const [body, shade, ink] = this.colors[color]
    // a weed: a spiky tuft with a grin
    return `<path d="M50 94L20 40L36 50L30 14L48 38L50 6L54 38L70 14L64 50L80 40Z" fill="#6FA343" stroke="#3F6B22" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="66" r="26" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="41" cy="58" r="4" fill="#222"/><circle cx="59" cy="58" r="4" fill="#222"/>${mouth(50, 66, 7, surprised)}${mark(color, 50, 81, 6, ink)}`
  },
}

const ocean: Look = {
  key: 'ocean',
  title: 'Ocean',
  colors: [
    ['#FF7F6E', '#C24B3C', '#FFF0EC'],
    ['#FFD66B', '#C9A02A', '#4A3600'],
    ['#48C9B0', '#1E8C77', '#E6FFF9'],
  ],
  jar: { fill: '#0F4C75', edge: '#BBE1FA', grid: '#165985' },
  half(color, link) {
    const [body, shade, ink] = this.colors[color]
    // a bubble: round, see-through edge, a shine; two bubbles stuck together
    const piece = `<path d="M100 12H52A38 38 0 0 0 52 88H100Z" fill="${body}" fill-opacity=".9" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="5"/><path d="M30 34Q38 24 50 22" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>`
    const loose = `<circle cx="50" cy="50" r="40" fill="${body}" fill-opacity=".9" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="5"/><path d="M28 36Q36 24 50 22" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>`
    return facing(link, piece, loose) + mark(color, 54, 56, 11, ink)
  },
  germ(color, surprised = false) {
    const [body, shade, ink] = this.colors[color]
    // a cheerful fish
    return `<path d="M78 50L98 30V70Z" fill="${shade}"/><ellipse cx="46" cy="50" rx="38" ry="28" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="28" cy="42" r="7" fill="#fff"/><circle cx="28" cy="43" r="3.5" fill="#222"/>${mouth(22, 58, 6, surprised)}${mark(color, 54, 56, 9, ink)}`
  },
}

const face = (cx: number, cy: number) =>
  `<circle cx="${cx - 10}" cy="${cy}" r="4.5" fill="#3B2B2B"/><circle cx="${cx + 10}" cy="${cy}" r="4.5" fill="#3B2B2B"/><path d="M${cx - 5} ${cy + 7}Q${cx} ${cy + 12} ${cx + 5} ${cy + 7}" stroke="#3B2B2B" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="${cx - 18}" cy="${cy + 8}" r="5" fill="#FF8FB1" fill-opacity=".7"/><circle cx="${cx + 18}" cy="${cy + 8}" r="5" fill="#FF8FB1" fill-opacity=".7"/>`

const kawaii: Look = {
  key: 'kawaii',
  title: 'Kawaii',
  colors: [
    ['#FF9EC4', '#E0679A', '#FFFFFF'],
    ['#FFE779', '#D9B524', '#6B5200'],
    ['#8FD3FF', '#4C9FD6', '#FFFFFF'],
  ],
  jar: { fill: '#FFF0F6', edge: '#E0679A', grid: '#FFE0EC' },
  half(color, link) {
    const [body, shade, ink] = this.colors[color]
    // the face sits upright whichever way the capsule turns
    const piece = `<path d="${HALF}" fill="${body}" stroke="${shade}" stroke-width="5"/>`
    const loose = `<circle cx="50" cy="50" r="40" fill="${body}" stroke="${shade}" stroke-width="5"/>`
    return facing(link, piece, loose) + face(50, 44) + mark(color, 50, 72, 7, ink)
  },
  germ(color, surprised = false) {
    const [body, shade, ink] = this.colors[color]
    return `<path d="M22 30L30 12L42 26L50 10L58 26L70 12L78 30" fill="${body}" stroke="${shade}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="56" r="36" fill="${body}" stroke="${shade}" stroke-width="5"/><circle cx="38" cy="50" r="4.5" fill="#3B2B2B"/><circle cx="62" cy="50" r="4.5" fill="#3B2B2B"/><circle cx="30" cy="60" r="5" fill="#FF8FB1" fill-opacity=".7"/><circle cx="70" cy="60" r="5" fill="#FF8FB1" fill-opacity=".7"/>${mouth(50, 60, 8, surprised, '#3B2B2B')}${mark(color, 50, 79, 7, ink)}`
  },
}

export const LOOKS: Look[] = [classic, space, garden, ocean, kawaii]

const KEY = 'zap:look'
// a saved key that no longer exists falls back to classic, never a blank jar
export const loadLook = (): Look => LOOKS.find(look => look.key === readSlot(KEY)) ?? classic
export const saveLook = (look: Look) => writeSlot(KEY, look.key)
