# zap

a capsule game with a beat, for kids. two-colour capsules fall into the jar:
steer them, line up four of a colour, and zap every germ. **no ads, no lives, no timers, nothing to
buy, no accounts, no cookies, nothing sold or shared.** works offline.

play it at [zap.royashbrook.com](https://zap.royashbrook.com).

## play locally

```sh
npm ci
npm run dev     # vite prints the local url
```

## what's inside

- **30 campaign levels**, four more germs each, plus a **daily board** that is
  the same jar for everyone in the world, and a link to send a friend the exact
  board you played.
- capsules fall on their own, tetris style: **slow** (the default), medium or
  fast, each level 12% faster than the last and a little faster every ten
  capsules, capped at three times the base and never past 8 rows a second.
  **calm · no fall** is there for little kids: the capsule waits until it is
  brought down.
- controls: slide and turn; hold the drop to bring it down fast and still steer;
  flick down on the jar (or space) to drop it straight down. a capsule that lands
  gets half a second (topped up by each move or turn, up to fifteen times) to
  slide under a ledge or turn into a gap before it sticks. see
  [capsule.ts](src/lib/engine/capsule.ts).
- a little rhythmic loop, made on the spot with web audio (no files), and every
  piece hops on its beat. the beat speeds up as the capsules do. one tap turns
  the sound off, and reduced motion stops the hopping.
- every board is dealt from a seed and **cleared by a bot with the capsules it
  will really hand out** before anyone sees it. the bot turns, slides and drops
  like a kid (no slides under ledges, no lock-delay tricks), sees the next
  capsule, and gets 400 capsules with no clock. so every board can be cleared;
  that is not a promise that every way of playing wins, and keeping up with the
  falling speeds is not proven. see
  [bot.ts](src/lib/engine/bot.ts) and [levels.ts](src/lib/engine/levels.ts).
  the proven deal for every level and three years of dailies is baked into
  [deals.json](src/lib/engine/deals.json), so a phone looks it up instead of
  running the bot. `npm run verify` re-proves the whole table; allow a few minutes.
- five **looks**: Classic, Space, Garden, Ocean and Kawaii. the germs smile, and
  look surprised only as they pop. every colour carries
  the same mark in every look (circle, triangle, square), so a colourblind kid
  reads the jar by shape. art lives in [skins.ts](src/lib/skins.ts).
- the falling-piece core ([fall.ts](src/lib/engine/fall.ts)) knows nothing about
  capsules, so the next falling-block game can lift it as it is.
- PWA: offline shell ([sw.ts](src/sw.ts)), an update you accept with one tap,
  install helper, share-a-board.

## tools

```sh
npm test              # engine rules, deals, the table
npm run verify        # re-prove every level and three years of dailies
npm run deals         # rewrite the table after an engine change
npm run check         # svelte-check
npm run build         # dist/, with /version.json
npx playwright install chromium webkit
npm run test:browser  # phone layout, controls, looks, share, offline
npm run icons         # regenerate the install pngs from public/icon.svg
```

## license

MIT
