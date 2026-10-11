import { test, expect } from "@playwright/test";

// zap #6 review: the music runs on its own timer, so hiding the page must stop it
// at that moment. animation frames are frozen before hiding, the way a backgrounded
// tab stops drawing, so the per-frame pause in the game loop cannot be what stops it.
// web audio is a counting fake: starts = notes scheduled, suspended = pauses.
async function fakeAudio(page) {
  await page.addInitScript(() => {
    window.__audio = { starts: 0, suspended: 0, resumed: 0 };
    const realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => realRaf((t) => { if (!window.__freezeFrames) fn(t); });
    const param = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
    const node = () => ({ gain: { ...param }, frequency: { ...param }, connect(next) { return next; }, start() { window.__audio.starts++; }, stop() {} });
    window.AudioContext = class {
      state = "running"; sampleRate = 48000; destination = {};
      get currentTime() { return performance.now() / 1000; }
      createGain() { return node(); }
      createOscillator() { return node(); }
      createBufferSource() { return node(); }
      createBiquadFilter() { return node(); }
      createBuffer(_c, length) { return { getChannelData: () => new Float32Array(length) }; }
      async resume() { this.state = "running"; window.__audio.resumed++; }
      async suspend() { this.state = "suspended"; window.__audio.suspended++; }
      async close() { this.state = "closed"; }
    };
  });
}
const audio = (page) => page.evaluate(() => ({ ...window.__audio }));
const setHidden = (page, hidden) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

for (const how of ["visibilitychange", "pagehide"])
  test(`the music stops at once on ${how}, even with no frame to stop it`, async ({ page }) => {
    await fakeAudio(page);
    await page.goto("/");
    await page.click("#play");
    await expect.poll(() => audio(page).then((a) => a.starts)).toBeGreaterThan(3);
    await page.evaluate(() => (window.__freezeFrames = true));
    if (how === "pagehide") await page.evaluate(() => dispatchEvent(new Event("pagehide")));
    else await setHidden(page, true);
    const before = await audio(page);
    await page.waitForTimeout(600);
    const after = await audio(page);
    // paused by the event itself: no frame ran between the event and this read
    expect(before.suspended).toBeGreaterThan(0);
    expect(after.starts).toBeLessThanOrEqual(before.starts + 1);
  });

test("coming back plays the music again", async ({ page }) => {
  await fakeAudio(page);
  await page.goto("/");
  await page.click("#play");
  await expect.poll(() => audio(page).then((a) => a.starts)).toBeGreaterThan(3);
  await page.evaluate(() => (window.__freezeFrames = true));
  await setHidden(page, true);
  await page.waitForTimeout(600);
  await page.evaluate(() => (window.__freezeFrames = false));
  await setHidden(page, false);
  const quiet = (await audio(page)).starts;
  await expect.poll(() => audio(page).then((a) => a.starts)).toBeGreaterThan(quiet);
  expect((await audio(page)).resumed).toBeGreaterThan(0);
});
