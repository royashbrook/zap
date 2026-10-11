<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { begin, campaign, daily, LEVELS, shared, type Deal } from "./lib/engine/levels.ts";
  import { drop, move, nudge, rotate, rowsPerSecond, soften, tick, type Game } from "./lib/engine/capsule.ts";
  import { dailySeed } from "./lib/engine/seed.ts";
  import type { Speed } from "./lib/engine/types.ts";
  import { jar, preview, type Pop } from "./lib/draw.ts";
  import { LOOKS, loadLook, saveLook, type Look } from "./lib/skins.ts";
  import { createMusic } from "./lib/music.ts";
  import { readJson, readSlot, writeJson, writeSlot } from "./lib/storage.ts";
  import { installControl } from "./install.ts";
  import { updateControl, type UpdateCheck } from "./pwa.ts";

  const ETHOS =
    "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
  // calm is last: an opt-in for little kids, the capsule waits until it is brought down
  const SPEEDS: Speed[] = ["slow", "medium", "fast", "calm"];

  // progress: the furthest level unlocked, the level picked, the best score
  interface Progress { reached: number; level: number; best: number }
  const PROGRESS = "zap:progress";
  let progress = $state<Progress>(readJson<Progress>(PROGRESS, { reached: 1, level: 1, best: 0 }));
  const keep = () => (saved = writeJson(PROGRESS, progress));
  let saved = $state(true);

  // capsules fall on their own by default; waiting for a drop played too much like
  // a puzzle. a speed someone already picked, calm included, stays theirs.
  const SPEED = "zap:speed";
  let speed = $state<Speed>(SPEEDS.includes(readSlot(SPEED) as Speed) ? (readSlot(SPEED) as Speed) : "slow");
  function pickSpeed(s: Speed) {
    speed = s;
    writeSlot(SPEED, s);
  }

  // the music: on unless someone turned it off
  const SOUND = "zap:sound";
  const soundAtStart = readSlot(SOUND) !== "off";
  let sound = $state(soundAtStart);
  const music = createMusic();
  music.setSound(soundAtStart);
  function toggleSound() {
    sound = !sound;
    writeSlot(SOUND, sound ? "on" : "off");
    music.setSound(sound);
  }
  // the four buttons are an extra; the board itself plays one-thumbed
  const BUTTONS = "zap:buttons";
  let buttons = $state(readSlot(BUTTONS) !== "off");
  function toggleButtons() {
    buttons = !buttons;
    writeSlot(BUTTONS, buttons ? "on" : "off");
  }
  const fallRate = (g: Game) => rowsPerSecond(g.speed, g.level, g.capsules);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let look = $state<Look>(loadLook());
  $effect(() => {
    document.documentElement.dataset.look = look.key;
  });
  function pickLook(l: Look) {
    look = l;
    saveLook(l);
  }

  type Mode = "campaign" | "daily" | "friend";
  let screen = $state<"menu" | "play">("menu");
  let mode = $state<Mode>("campaign");
  let deal = $state<Deal | null>(null);
  let game: Game | null = null;
  // the game object mutates in place; this counter is what the screen watches
  let frame = $state(0);
  let pops = $state<Pop[]>([]);
  let chain = $state(0);
  let sheet = $state<"" | "howto" | "about" | "looks" | "ios">("");
  let toast = $state("");
  // a real modal: the menu behind it goes inert and escape closes it
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  const view = $derived.by(() => {
    frame;
    if (!game) return null;
    return {
      markup: jar(game, look, pops),
      next: preview(game.next, look),
      score: game.score,
      germs: game.germs,
      level: game.level,
      status: game.status,
    };
  });

  function play(d: Deal, m: Mode) {
    release();
    deal = d;
    mode = m;
    game = begin(d, speed);
    pops = [];
    chain = 0;
    screen = "play";
    frame++;
    music.play(fallRate(game));
  }
  const playCampaign = () => play(campaign(progress.level), "campaign");
  const playDaily = () => play(daily(dailySeed()), "daily");

  function stepLevel(by: number) {
    progress.level = Math.min(progress.reached, Math.max(1, progress.level + by));
    keep();
  }

  // after any action: show what a lock cleared, record a win
  function settled(before: number) {
    if (!game) return;
    if (game.capsules !== before || game.status !== "playing") {
      const steps = game.last;
      if (steps.length) {
        pops = steps.flatMap((s) => s.cleared.map((i, k) => ({ i, color: s.colors[k], germ: s.kinds[k] === "germ" })));
        chain = steps.length;
        clearTimeout(popTimer);
        popTimer = setTimeout(() => ((pops = []), (chain = 0)), 450);
      }
      if (game.status === "won" && mode === "campaign") {
        progress.best = Math.max(progress.best, game.score);
        if (game.level === progress.level && progress.level < LEVELS) {
          progress.reached = Math.max(progress.reached, progress.level + 1);
        }
        keep();
      }
    }
    frame++;
  }
  let popTimer: ReturnType<typeof setTimeout>;
  function act(fn: (g: Game) => unknown) {
    if (!game || screen !== "play" || game.status !== "playing" || sheet) return;
    const before = game.capsules;
    fn(game);
    settled(before);
  }

  function nextLevel() {
    if (mode === "campaign" && progress.level < LEVELS) {
      progress.level++;
      keep();
    }
    playCampaign();
  }
  const again = () => deal && play(deal, mode);

  // real time: gravity, the lock delay, a held drop, and the beat. the same fall
  // at any frame rate; calm only falls while the drop is held.
  let raf = 0;
  let last = 0;
  function loop(now: number) {
    const live = game && screen === "play" && !sheet && game.status === "playing" && !document.hidden;
    if (live && last) {
      const before = game!.capsules;
      const y = game!.active?.body.y;
      tick(game!, Math.min(0.1, (now - last) / 1000));
      if (game!.capsules !== before || game!.active?.body.y !== y || game!.status !== "playing") settled(before);
      music.tempo(fallRate(game!));
    }
    // the music runs only while a game is being played
    if (!live || game?.status !== "playing") music.pause();
    // every piece hops on the beat; one css variable, set once a frame
    if (jarEl && !reduced) jarEl.style.setProperty("--pulse", music.pulse().toFixed(3));
    last = now;
    raf = requestAnimationFrame(loop);
  }
  // a hidden or departing page goes quiet at that moment, not on the next frame:
  // a hidden tab may never draw again, and the music keeps its own timer. the
  // frame clock restarts too, so coming back does not jump by the time away.
  function quiet() {
    release();
    music.pause();
    last = 0;
  }
  const visibility = () => (document.hidden ? quiet() : resume());
  // back from the menu sheet or a hidden tab: the music picks up again
  function resume() {
    if (game && screen === "play" && !sheet && game.status === "playing" && !document.hidden) music.play(fallRate(game));
  }

  // hold to repeat a slide; hold the drop button to bring the capsule down fast.
  // the two are separate, so one thumb can hold the drop while the other steers.
  // a hold belongs to the game it started on: a new game, the menu, an open
  // sheet or a cancelled pointer ends it, so no stray repeat reaches a new board
  let slide: ReturnType<typeof setTimeout> | undefined;
  function releaseSlide() {
    clearTimeout(slide);
    slide = undefined;
  }
  // the held drop is a flag on the game itself, so a new game starts let go
  const releaseDrop = () => game && soften(game, false);
  function release() {
    releaseSlide();
    releaseTouch();
    releaseDrop();
  }
  function hold(fn: (g: Game) => unknown) {
    releaseSlide();
    act(fn);
    const owner = game;
    const again = () => {
      if (game !== owner || screen !== "play" || sheet) return releaseSlide();
      act(fn);
      slide = setTimeout(again, 90);
    };
    slide = setTimeout(again, 220);
  }
  const dropDown = () => act((g) => soften(g, true));

  function key(e: KeyboardEvent) {
    if (screen !== "play" || sheet) return;
    // space and enter belong to a focused button; the button does its own job
    if ((e.key === " " || e.key === "Enter") && (e.target as Element | null)?.closest?.("button, a, input, select, textarea")) return;
    const map: Record<string, (g: Game) => unknown> = {
      ArrowLeft: (g) => move(g, -1),
      ArrowRight: (g) => move(g, 1),
      ArrowUp: (g) => rotate(g, 1),
      x: (g) => rotate(g, 1),
      z: (g) => rotate(g, -1),
      " ": drop,
    };
    // the down arrow is the held drop: down while held, let go on release
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!e.repeat) act((g) => soften(g, true));
      return;
    }
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    act(fn);
  }
  function keyUp(e: KeyboardEvent) {
    if (e.key === "ArrowDown") releaseDrop();
  }

  // one thumb plays the whole game, anywhere on the board or the strip under it:
  // drag sideways and the capsule follows a column per column of travel, a quick
  // tap turns it, a finger held still (or pulled slowly down) brings it down fast
  // and keeps steering while it stays down, and a quick flick down drops it.
  // one finger only; a second one is ignored. buttons never start a gesture.
  const HOLD_MS = 220; // still this long, and it is a hold, not a tap
  const SLOW_DOWN = 0.6; // pulled down this many cells, and it is a hold too
  const FLICK_CELLS = 1.5; // down this far ...
  const FLICK_MS = 250; // ... this fast, and it drops
  const TAP_PX = 10;
  let touch: { id: number; x0: number; y0: number; x: number; start: number; moved: boolean; held: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
  let jarEl = $state<SVGSVGElement>();
  const cellPx = () => (jarEl ? jarEl.getBoundingClientRect().width / 8 : 40);
  function releaseTouch() {
    if (touch) clearTimeout(touch.timer);
    touch = null;
  }
  function holdDown() {
    if (!touch || touch.held) return;
    touch.held = true;
    act((g) => soften(g, true));
  }
  function down(e: PointerEvent) {
    if (touch || !game || game.status !== "playing" || (e.target as Element).closest?.("button")) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const owner = game;
    touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, start: performance.now(), moved: false, held: false };
    touch.timer = setTimeout(() => {
      if (touch && game === owner && !touch.moved) holdDown();
    }, HOLD_MS);
  }
  function drag(e: PointerEvent) {
    if (!touch || e.pointerId !== touch.id) return;
    const step = cellPx();
    while (e.clientX - touch.x >= step) (touch.x += step), (touch.moved = true), act((g) => move(g, 1));
    while (touch.x - e.clientX >= step) (touch.x -= step), (touch.moved = true), act((g) => move(g, -1));
    // a slow pull down is a hold; a fast one is judged as a flick when the finger lifts
    if (e.clientY - touch.y0 > step * SLOW_DOWN && performance.now() - touch.start >= FLICK_MS) holdDown();
  }
  function up(e: PointerEvent) {
    if (!touch || e.pointerId !== touch.id) return;
    const { x0, y0, start, moved, held } = touch;
    releaseTouch();
    const fall = e.clientY - y0, quick = performance.now() - start < FLICK_MS;
    if (held) releaseDrop();
    if (fall > cellPx() * FLICK_CELLS && quick) act(drop);
    else if (!moved && !held && Math.abs(fall) < TAP_PX && Math.abs(e.clientX - x0) < TAP_PX) act((g) => rotate(g, 1));
  }
  function cancel(e: PointerEvent) {
    if (!touch || e.pointerId !== touch.id) return;
    const held = touch.held;
    releaseTouch();
    if (held) releaseDrop();
  }

  // send a board: a link that opens the exact board, nothing else to it
  const boardUrl = (d: Deal) => `${location.origin}/?seed=${d.seed}&level=${d.level}&v=${d.variant}`;
  async function share(d: Deal) {
    const url = boardUrl(d);
    const payload = { title: "zap", text: "play this exact zap board with me", url };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
        await navigator.share(payload);
        return;
      }
    } catch (error) {
      // a closed share sheet is the kid changing their mind, not an error
      if ((error as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("link copied. send it to a friend");
    } catch {
      flash(url);
    }
  }
  function flash(text: string) {
    toast = text;
    setTimeout(() => (toast = ""), 3500);
  }

  let installVisible = $state(false);
  let updateReady = $state(false);
  let updateNote = $state("");
  let install: ReturnType<typeof installControl>;
  let updates: ReturnType<typeof updateControl>;
  async function checkUpdate() {
    updateNote = "checking...";
    const result: UpdateCheck = await updates.check();
    updateNote = result === "current" ? "you have the newest zap" : result === "newer" ? "a new version is ready" : "could not check right now";
  }
  async function applyUpdate() {
    try {
      await updates.apply();
    } catch {
      updateNote = "the update did not finish. try again in a moment";
    }
  }

  onMount(() => {
    install = installControl((v) => (installVisible = v), () => (sheet = "ios"));
    updates = updateControl(() => (updateReady = true));
    addEventListener("keydown", key);
    addEventListener("keyup", keyUp);
    // a hold cannot outlive the player looking away, and the music waits too
    addEventListener("blur", release);
    addEventListener("pagehide", quiet);
    addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    raf = requestAnimationFrame(loop);
    // a friend's link opens straight onto their board
    const q = new URLSearchParams(location.search);
    const seed = Number(q.get("seed")), level = Number(q.get("level")), v = Number(q.get("v") ?? 0);
    if (Number.isSafeInteger(seed) && seed > 0 && Number.isSafeInteger(level) && level >= 1 && level <= LEVELS && Number.isSafeInteger(v) && v >= 0) {
      const board = shared(seed, level, v);
      if (board) play(board, "friend");
      else flash("that link does not open a board we checked");
    }
  });
  onDestroy(() => {
    install?.dispose();
    updates?.dispose();
    cancelAnimationFrame(raf);
    clearTimeout(slide);
    music.dispose();
    if (typeof removeEventListener === "function") {
      removeEventListener("keydown", key);
      removeEventListener("keyup", keyUp);
      removeEventListener("blur", release);
      removeEventListener("pagehide", quiet);
      removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    }
  });
</script>

{#if screen === "menu"}
  <main class="menu">
    <span class="corner">v{__APP_VERSION__}</span>
    <h1 class="wordmark">
      <svg viewBox="0 0 200 100" aria-hidden="true">{@html preview([0, 2], look)}</svg>
      zap
    </h1>
    <p class="tag">drop capsules, match four, zap every germ.</p>
    <button id="play" class="big" onclick={playCampaign}>PLAY · LEVEL {progress.level}</button>
    <div class="levels" role="group" aria-label="pick a level">
      <button aria-label="easier level" disabled={progress.level <= 1} onclick={() => stepLevel(-1)}>◀</button>
      <span>level {progress.level} of {progress.reached}</span>
      <button aria-label="harder level" disabled={progress.level >= progress.reached} onclick={() => stepLevel(1)}>▶</button>
    </div>
    <div class="speeds" role="radiogroup" aria-label="speed">
      {#each SPEEDS as s}
        <button role="radio" aria-checked={speed === s} class:on={speed === s} class:calm={s === "calm"} onclick={() => pickSpeed(s)}>{s === "calm" ? "CALM · NO FALL" : s.toUpperCase()}</button>
      {/each}
    </div>
    <button id="daily" onclick={playDaily}>DAILY</button>
    <button id="friends" onclick={() => share(campaign(progress.level))}>SEND A BOARD</button>
    <div class="row">
      <button id="howto" onclick={() => (sheet = "howto")}>HOW TO PLAY</button>
      <button id="looks" onclick={() => (sheet = "looks")}>LOOKS</button>
    </div>
    <div class="row">
      <button id="sound" aria-pressed={sound} onclick={toggleSound}>{sound ? "SOUND ON" : "SOUND OFF"}</button>
      <button id="buttons" aria-pressed={buttons} onclick={toggleButtons}>{buttons ? "BUTTONS ON" : "BUTTONS OFF"}</button>
    </div>
    <div class="row">
      {#if installVisible}<button id="install" onclick={() => install.prompt()}>INSTALL</button>{/if}
      <button id="about" onclick={() => (sheet = "about")}>ABOUT</button>
    </div>
    {#if progress.best}<p class="best">best score {progress.best}</p>{/if}
    {#if !saved}<p class="warn">this browser is not saving progress</p>{/if}
  </main>
{:else if view}
  <main class="play" onpointerdowncapture={music.wake}>
    <header class="hud">
      <button class="back" aria-label="menu" onclick={() => (screen = "menu")}>☰</button>
      <button id="hud-sound" class="back" aria-label={sound ? "sound on" : "sound off"} aria-pressed={sound} onclick={toggleSound}>{sound ? "♪" : "–"}</button>
      <div class="stat"><b>{mode === "daily" ? "DAILY" : mode === "friend" ? "FRIEND" : `LEVEL ${view.level}`}</b></div>
      <div class="stat" id="germs"><span>germs</span><b>{view.germs}</b></div>
      <div class="stat" id="score"><span>score</span><b>{view.score}</b></div>
      <div class="next" aria-label="next capsule"><svg viewBox="0 0 200 100">{@html view.next}</svg></div>
    </header>
    <div class="surface" role="application" aria-label="play area: drag to slide, tap to turn, hold to fall faster, flick down to drop" onpointerdown={down} onpointermove={drag} onpointerup={up} onpointercancel={cancel} onlostpointercapture={cancel}>
    <div class="well">
      <svg bind:this={jarEl} id="jar" viewBox="0 0 800 1600" role="img" aria-label="the board">{@html view.markup}</svg>
      {#if chain > 1}<div class="chain">chain x{chain}!</div>{/if}
      {#if view.status === "won"}
        <div class="over" id="won">
          <h2>{mode === "campaign" ? "finished!" : "you zapped them all!"}</h2>
          <p>score {view.score}</p>
          {#if mode === "campaign" && view.level < LEVELS}
            <button class="big" onclick={nextLevel}>NEXT LEVEL</button>
          {:else}
            <button class="big" onclick={again}>PLAY AGAIN</button>
          {/if}
          {#if deal}<button onclick={() => share(deal!)}>SEND THIS BOARD</button>{/if}
          <button onclick={() => (screen = "menu")}>MENU</button>
        </div>
      {:else if view.status === "lost"}
        <div class="over" id="lost">
          <h2>out of room</h2>
          <p>no worries. same board, fresh go.</p>
          <button class="big" onclick={again}>TRY AGAIN</button>
          <button onclick={() => (screen = "menu")}>MENU</button>
        </div>
      {/if}
    </div>
    {#if !buttons}<div class="thumb" aria-hidden="true">drag · tap · hold · flick</div>{/if}
    </div>
    {#if buttons}
    <nav class="pad" aria-label="controls">
      <button aria-label="left" onpointerdown={() => hold((g) => move(g, -1))} onpointerup={releaseSlide} onpointerleave={releaseSlide} onpointercancel={releaseSlide} onlostpointercapture={releaseSlide} onclick={(e) => e.detail === 0 && act((g) => move(g, -1))}>◀</button>
      <button aria-label="turn" onpointerdown={() => act((g) => rotate(g, 1))} onclick={(e) => e.detail === 0 && act((g) => rotate(g, 1))}
        ><svg class="turn" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button
      >
      <button aria-label="right" onpointerdown={() => hold((g) => move(g, 1))} onpointerup={releaseSlide} onpointerleave={releaseSlide} onpointercancel={releaseSlide} onlostpointercapture={releaseSlide} onclick={(e) => e.detail === 0 && act((g) => move(g, 1))}>▶</button>
      <button aria-label="drop" class="drop" onpointerdown={dropDown} onpointerup={releaseDrop} onpointerleave={releaseDrop} onpointercancel={releaseDrop} onlostpointercapture={releaseDrop} onclick={(e) => e.detail === 0 && act(nudge)}>▼</button>
    </nav>
    {/if}
  </main>
{/if}

{#if toast}<div class="toast" role="status">{toast}</div>{/if}
{#if updateReady}<button class="update" onclick={applyUpdate}>NEW VERSION, TAP TO LOAD</button>{/if}

{#if sheet}
  <dialog bind:this={dialog} class="sheet" onclose={() => (sheet = "")}>
    <div class="card">
      {#if sheet === "howto"}
        <h2>how to play</h2>
        <p>capsules drop onto the board. each one has two halves.</p>
        <p>one thumb does it all, anywhere on the board: <b>drag</b> to slide, <b>tap</b> to turn, <b>hold</b> to fall faster (you can still slide while you hold), and <b>flick down</b> to drop it straight down.</p>
        <p>when it lands you get a moment to slide it under a ledge or turn it into a gap before it sticks.</p>
        <p>or use the buttons: <b>◀ ▶</b> slide, the round arrow turns, hold <b>▼</b> to fall fast. turn them off on the menu if you do not need them.</p>
        <p>line up <b>four of one colour</b>, across or up and down, and they zap. germs count too.</p>
        <p>zap every germ to finish. loose halves fall, and a fall that makes four again is a chain.</p>
        <p>each colour has its own shape: a circle, a triangle, a square.</p>
        <p>capsules fall on their own, a bit faster each level. pick slow, medium or fast. <b>calm</b> never falls by itself: hold your thumb on the board, or hold <b>▼</b>, to bring it down.</p>
      {:else if sheet === "looks"}
        <h2>looks</h2>
        <div class="looks">
          {#each LOOKS as l}
            <button class="look" class:on={look.key === l.key} aria-pressed={look.key === l.key} onclick={() => pickLook(l)}>
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <rect width="200" height="200" rx="24" fill={l.jar.fill} />
                <g transform="translate(0 100)">{@html l.germ(1)}</g>
                <g transform="translate(100 100)">{@html l.germ(2)}</g>
                {@html preview([0, 1], l)}
              </svg>
              <span>{l.title}</span>
            </button>
          {/each}
        </div>
      {:else if sheet === "about"}
        <h2>about zap</h2>
        <p>a capsule game with a beat. drop capsules onto the board, match four of a colour, and zap every germ. a new board every day, and one to send a friend.</p>
        <p class="ethos">{ETHOS}</p>
        <p class="version">version {__APP_VERSION__}</p>
        <button onclick={checkUpdate}>CHECK FOR UPDATE</button>
        {#if updateNote}<p role="status">{updateNote}</p>{/if}
        <p><a class="licences" href="/licenses.md" target="_blank" rel="noopener">licences</a></p>
        <div class="maker">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 3 12C-4 4 6-3 12 5 18-3 28 4 21 12Z" /></svg>
          made with love by
          <a href="https://royashbrook.com" target="_blank" rel="noopener">roy</a>
          +
          <a href="https://royashbrook.com/agents" target="_blank" rel="noopener">ai</a>
          ·
          <a href="https://github.com/sponsors/royashbrook" target="_blank" rel="noopener">sponsor me</a>
        </div>
      {:else if sheet === "ios"}
        <h2>install zap</h2>
        <p>in safari, tap the <b>share</b> button, then <b>add to home screen</b>.</p>
      {/if}
      <button id="close" class="big" onclick={() => (sheet = "")}>BACK</button>
    </div>
  </dialog>
{/if}
