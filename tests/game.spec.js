import { test, expect } from "@playwright/test";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { campaign, begin } from "../src/lib/engine/levels.ts";
import { choose } from "../src/lib/engine/bot.ts";
import { drop, move, rotate } from "../src/lib/engine/capsule.ts";

const ETHOS =
  "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
const active = (page) =>
  page.locator("#jar g.active").evaluateAll((els) => els.map((e) => e.parentElement.getAttribute("transform")));
const pieces = (page) => page.locator("#jar > g").count();
const press = (page, name) => page.getByRole("button", { name, exact: true }).dispatchEvent("pointerdown");

test("the menu carries the house ethos, word for word", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("meta[name=description]")).toHaveAttribute("content", new RegExp(ETHOS.replaceAll(".", "\\.")));
  await expect(page.locator("#play")).toHaveText("PLAY · LEVEL 1");
  await page.click("#about");
  await expect(page.locator(".ethos")).toHaveText(ETHOS);
  await expect(page.locator(".maker")).toContainText("made with love by");
});

test("a capsule slides, turns and drops, and the jar keeps it", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  const start = await active(page);
  expect(start).toHaveLength(2);
  await press(page, "right");
  await page.getByRole("button", { name: "right" }).dispatchEvent("pointerup");
  const slid = await active(page);
  expect(slid).not.toEqual(start);
  await press(page, "turn");
  const turned = await active(page);
  expect(turned).not.toEqual(slid);
  const before = await pieces(page);
  await page.keyboard.press("Space");
  // the dropped capsule stays in the jar and a new one appears at the top
  await expect.poll(() => pieces(page)).toBe(before + 2);
  expect(await active(page)).toEqual(start);
});

test("calm never falls by itself; slow does", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  const start = await active(page);
  await page.waitForTimeout(2500);
  expect(await active(page)).toEqual(start);
  await page.click(".back");
  await page.getByRole("radio", { name: "SLOW" }).click();
  await page.click("#play");
  const first = await active(page);
  await expect.poll(() => active(page), { timeout: 4000 }).not.toEqual(first);
});

test("a look sticks across a reload", async ({ page }) => {
  await page.goto("/");
  await page.click("#looks");
  await page.getByRole("button", { name: "Space" }).click();
  await page.click("#close");
  await expect(page.locator("html")).toHaveAttribute("data-look", "space");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-look", "space");
});

test("how to play opens in the app", async ({ page }) => {
  await page.goto("/");
  await page.click("#howto");
  await expect(page.getByRole("dialog")).toContainText("four of one colour");
  await page.click("#close");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("play with friends sends a link that opens the exact board", async ({ page }) => {
  await page.addInitScript(() => {
    // no share sheet here: the clipboard fallback is the path that always exists
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => (window.__copied = t) } });
  });
  await page.goto("/");
  await page.click("#friends");
  await expect(page.locator(".toast")).toContainText("link copied");
  const url = new URL(await page.evaluate(() => window.__copied));
  expect(url.searchParams.get("seed")).toBe("1");
  expect(url.searchParams.get("level")).toBe("1");
  await page.goto(url.pathname + url.search);
  await expect(page.locator(".hud")).toContainText("FRIEND");
  await expect(page.locator("#germs b")).toHaveText("4");
});

test("the bot's own moves clear level 1 here too, and level 2 unlocks", async ({ page }) => {
  // replay the proven plan with real key presses: the browser game must deal
  // the same jar and the same capsules the build proved
  const game = begin(campaign(1), "calm");
  const keys = [];
  while (game.status === "playing") {
    const plan = choose(game);
    for (let t = 0; t < plan.turn; t++) rotate(game, 1), keys.push("ArrowUp");
    while (game.active.body.x !== plan.x) {
      const dx = Math.sign(plan.x - game.active.body.x);
      move(game, dx);
      keys.push(dx > 0 ? "ArrowRight" : "ArrowLeft");
    }
    drop(game);
    keys.push(" ");
  }
  expect(game.status).toBe("won");
  await page.goto("/");
  await page.click("#play");
  for (const key of keys) await page.keyboard.press(key === " " ? "Space" : key);
  await expect(page.locator("#won")).toBeVisible();
  await page.screenshot({ path: "test-results/won.png" });
  await page.reload();
  await expect(page.locator("#play")).toHaveText("PLAY · LEVEL 1");
  await expect(page.locator(".levels")).toContainText("level 1 of 2");
});

// a disposable server we can really stop: webkit refuses setOffline even for
// a worker answering from its cache, and a refused connection is the real case
async function startServer() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const root = resolve("dist");
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
      if (!file.startsWith(root + "/")) return res.writeHead(403).end();
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => (server.listening ? new Promise((r) => (server.close(r), server.closeAllConnections())) : Promise.resolve()),
  };
}

test("after one visit it reopens with the server gone", async ({ browser }) => {
  const server = await startServer();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await server.close();
    await page.reload();
    await expect(page.locator("#play")).toBeVisible();
    await page.click("#play");
    await expect(page.locator("#jar g.active")).toHaveCount(2);
  } finally {
    await context.close();
    await server.close();
  }
});

// review fixes (#1): a hold ends with its game, a focused button keeps its own
// keys, and an edited link cannot open a board the bot never cleared
const capsuleY = (page) => page.locator("#jar g.active").first().evaluate((e) => e.parentElement.getAttribute("transform"));

test("a held drop stops when the pointer is cancelled", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  const drop = page.getByRole("button", { name: "drop", exact: true });
  await drop.dispatchEvent("pointerdown");
  await page.waitForTimeout(400); // the ease has begun
  await drop.dispatchEvent("pointercancel");
  const stopped = await capsuleY(page);
  await page.waitForTimeout(600);
  expect(await capsuleY(page)).toBe(stopped);
});

test("a held drop does not follow the player to the menu or into a new game", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  await page.getByRole("button", { name: "drop", exact: true }).dispatchEvent("pointerdown");
  await page.waitForTimeout(400);
  await page.click(".back"); // the finger never lifted
  await page.click("#play");
  const fresh = await active(page);
  await page.waitForTimeout(800); // calm: nothing should move it
  expect(await active(page)).toEqual(fresh);
});

test("enter and space on a focused button do that button's job", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  const start = await active(page);
  const before = await pieces(page);
  await page.getByRole("button", { name: "turn", exact: true }).focus();
  await page.keyboard.press("Enter");
  const turned = await active(page);
  expect(turned).not.toEqual(start);
  await page.keyboard.press("Space");
  expect(await pieces(page)).toBe(before); // space turned it, it did not drop it
  expect(await active(page)).not.toEqual(turned);
});

test("an edited link opens the proven board, not the variant it names", async ({ page }) => {
  await page.goto("/?seed=26&level=26&v=7");
  const proven = await page.locator("#jar").innerHTML();
  await page.goto("/?seed=26&level=26&v=0");
  expect(await page.locator("#jar").innerHTML()).toBe(proven);
});

test("a held slide stops when the window loses focus", async ({ page }) => {
  await page.goto("/");
  await page.click("#play");
  await page.getByRole("button", { name: "left", exact: true }).dispatchEvent("pointerdown");
  await page.evaluate(() => dispatchEvent(new Event("blur")));
  const stopped = await active(page);
  await page.waitForTimeout(500);
  expect(await active(page)).toEqual(stopped);
});

test("a link to a board nobody proved stays on the menu and says so", async ({ page }) => {
  await page.goto("/?seed=26&level=26&v=99");
  // listed: the table's board opens, the bad variant is ignored
  await expect(page.locator(".hud")).toContainText("FRIEND");
  // unlisted and refused by the bot (checked: proven(dealFor(999999, 26, 3)) is false)
  await page.goto("/?seed=999999&level=26&v=3");
  await expect(page.locator(".toast")).toContainText("does not open a board we checked");
  await expect(page.locator("#play")).toBeVisible();
});

test("the menu says what sharing is, and shows the build top right", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#friends")).toHaveText("SEND A BOARD");
  await expect(page.locator(".corner")).toHaveText(/^v\d+\.\d+\.\d+/);
});
