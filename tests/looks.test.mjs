import test from 'node:test'
import assert from 'node:assert/strict'
import { LOOKS } from '../src/lib/skins.ts'
import { jar } from '../src/lib/draw.ts'
import { makeGrid, start, HEIGHT, WIDTH } from '../src/lib/engine/capsule.ts'
import { put } from '../src/lib/engine/fall.ts'

// #5: the germs looked scared. they smile now, and only look surprised in the
// instant they pop.
test('every germ in every look smiles, and is surprised only while popping', () => {
  for (const look of LOOKS)
    for (const color of [0, 1, 2]) {
      const happy = look.germ(color)
      const popping = look.germ(color, true)
      assert.match(happy, /class="mouth smile"/, `${look.key} ${color} smiles`)
      assert.doesNotMatch(happy, /mouth oh/, `${look.key} ${color} is not surprised at rest`)
      assert.match(popping, /class="mouth oh"/, `${look.key} ${color} is surprised as it pops`)
    }
})

test('a popping germ is drawn with its surprised face; a popping half just bursts', () => {
  const g = makeGrid(WIDTH, HEIGHT)
  put(g, 7, HEIGHT - 1, { kind: 'germ', color: 2 })
  const game = start(g, 1, 1)
  for (const look of LOOKS) {
    const svg = jar(game, look, [{ i: 0, color: 1, germ: true }, { i: 1, color: 0 }])
    assert.match(svg, /class="pop surprised"/, look.key)
    assert.equal((svg.match(/mouth oh/g) ?? []).length, 1, `${look.key}: only the popping germ`)
    assert.match(svg, /<circle [^>]*class="pop"/, `${look.key}: the half bursts as a plain pop`)
  }
})
