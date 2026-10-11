import { test, expect } from "@playwright/test";

// one-thumb play (#8): real pointer input on the board and on the strip under it.
// calm, so nothing moves unless a gesture moves it.
const calm = (page, extra = {}) =>
  page.addInitScript((more) => {
    localStorage.setItem("zap:speed", "calm");
    for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
  }, extra);
// the falling capsule's column and row, from its drawn position (100 units a cell)
const cells = (page) =>
  page.locator("#jar g.active").evaluateAll((els) =>
    els.map((e) => e.parentElement.getAttribute("transform").match(/translate\((\d+)[ ,]+(\d+)\)/).slice(1).map((n) => Number(n) / 100)),
  );
const column = async (page) => Math.min(...(await cells(page)).map(([x]) => x));
const row = async (page) => Math.max(...(await cells(page)).map(([, y]) => y));
const settled = (page) => page.locator("#jar g.piece:not(.active)").count();
async function spots(page) {
  const jar = await page.locator("#jar").boundingBox();
  const cell = jar.width / 8;
  const onBoard = { x: jar.x + jar.width / 2, y: jar.y + jar.height * 0.7 };
  return { cell, onBoard };
}
async function slide(page, from, columns, cell) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (columns * cell + Math.sign(columns) * 4) * (i / 8), from.y);
  await page.mouse.up();
}

test("drag on the board slides the capsule a column per column of travel", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const { cell, onBoard } = await spots(page);
  const start = await column(page);
  await slide(page, onBoard, 2, cell);
  expect(await column(page)).toBe(start + 2);
  await slide(page, onBoard, -3, cell);
  expect(await column(page)).toBe(start - 1);
});

test("a quick tap turns it and nothing else", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const { onBoard } = await spots(page);
  const before = await cells(page);
  const pieces = await settled(page);
  await page.mouse.click(onBoard.x, onBoard.y);
  const after = await cells(page);
  expect(after).not.toEqual(before);
  expect(new Set(after.map(([x]) => x)).size).toBe(1); // flat became upright
  expect(await settled(page)).toBe(pieces);
});

test("holding a thumb still brings it down fast, and letting go stops it", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const { onBoard } = await spots(page);
  const top = await row(page);
  await page.mouse.move(onBoard.x, onBoard.y);
  await page.mouse.down();
  await page.waitForTimeout(150); // under the hold time: still nothing
  expect(await row(page)).toBe(top);
  await expect.poll(() => row(page), { timeout: 2000 }).toBeGreaterThan(top + 1);
  await page.mouse.up();
  const stopped = await row(page);
  await page.waitForTimeout(500);
  expect(await row(page)).toBe(stopped); // calm: no fall once the thumb is up
});

test("a quick flick down drops it all the way and it sticks", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const { cell, onBoard } = await spots(page);
  const pieces = await settled(page);
  await page.mouse.move(onBoard.x, onBoard.y - cell * 3);
  await page.mouse.down();
  await page.mouse.move(onBoard.x, onBoard.y - cell * 1.5);
  await page.mouse.move(onBoard.x, onBoard.y);
  await page.mouse.up();
  await expect.poll(() => settled(page)).toBe(pieces + 2);
});

test("a held thumb does not follow the player to the menu or into a new game", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const { onBoard } = await spots(page);
  await page.mouse.move(onBoard.x, onBoard.y);
  await page.mouse.down();
  await expect.poll(() => row(page), { timeout: 2000 }).toBeGreaterThan(1);
  // the thumb never lifts: menu, then a fresh game
  await page.evaluate(() => document.querySelector(".back").click());
  await page.evaluate(() => document.querySelector("#play").click());
  const fresh = await row(page);
  await page.waitForTimeout(600);
  expect(await row(page)).toBe(fresh);
  await page.mouse.up();
});

test("buttons off hides the bar, the strip under the board plays, and it sticks", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#buttons");
  await expect(page.locator("#buttons")).toHaveText("BUTTONS OFF");
  await page.reload();
  await expect(page.locator("#buttons")).toHaveText("BUTTONS OFF");
  await page.click("#play");
  await expect(page.locator("nav.pad")).toHaveCount(0);
  const strip = await page.locator(".thumb").boundingBox();
  const jar = await page.locator("#jar").boundingBox();
  expect(strip.y).toBeGreaterThanOrEqual(jar.y + jar.height - 1); // it is under the board
  const cell = jar.width / 8;
  const start = await column(page);
  await slide(page, { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 }, 2, cell);
  expect(await column(page)).toBe(start + 2);
  // and any spare width beside the board, inside the play area, takes gestures too
  const area = await page.locator(".surface").boundingBox();
  if (jar.x - area.x >= 8) {
    await page.mouse.click((area.x + jar.x) / 2, jar.y + jar.height / 2);
    expect(new Set((await cells(page)).map(([x]) => x)).size).toBe(1);
  }
});

test("a press on a button never also starts a gesture", async ({ page }) => {
  await calm(page);
  await page.goto("/");
  await page.click("#play");
  const before = await cells(page);
  const turn = await page.getByRole("button", { name: "turn", exact: true }).boundingBox();
  await page.mouse.click(turn.x + turn.width / 2, turn.y + turn.height / 2);
  const after = await cells(page);
  expect(after).not.toEqual(before);
  // exactly one turn from the button, not a second one from a tap gesture
  expect(new Set(after.map(([x]) => x)).size).toBe(1);
});
