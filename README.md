# zap

a cosy capsule puzzle for kids. drop two-colour capsules into the jar, line up
four of a colour, and zap every germ. **no ads, no lives, no timers, nothing to
buy, no accounts, no cookies, nothing sold or shared.** works offline.

play it at [zap.royashbrook.com](https://zap.royashbrook.com).

a [kidgames](https://github.com/royashbrook/kidgames) house game.

## play locally

```sh
npm ci
npm run dev     # vite prints the local url
```

## what's inside

- **30 campaign levels**, four more germs each, plus a **daily board** that is
  the same jar for everyone in the world, and a link to send a friend the exact
  board you played.
- four speeds. **calm** is the default: the capsule waits until you drop it.
  slow, medium and fast fall on their own, a little faster each level.
- every board is dealt from a seed and **played through by a bot with the
  capsules it will really hand out** before anyone sees it: see
  [bot.ts](src/lib/engine/bot.ts) and [levels.ts](src/lib/engine/levels.ts).
  the proven deal for every level and three years of dailies is baked into
  [deals.json](src/lib/engine/deals.json), so a phone looks it up instead of
  running the bot. `npm run verify` re-proves the whole table; allow a few minutes.
- five **looks**: Classic, Space, Garden, Ocean and Kawaii. every colour carries
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
