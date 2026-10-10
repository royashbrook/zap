<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { begin, campaign, daily, dealFor, LEVELS, type Deal } from "./lib/engine/levels.ts";
  import { drop, move, nudge, rotate, tick, type Game } from "./lib/engine/capsule.ts";
  import { dailySeed } from "./lib/engine/seed.ts";
  import type { Speed } from "./lib/engine/types.ts";
  import { jar, preview, type Pop } from "./lib/draw.ts";
  import { LOOKS, loadLook, saveLook, type Look } from "./lib/skins.ts";
  import { readJson, readSlot, writeJson, writeSlot } from "./lib/storage.ts";
  import { installControl } from "./install.ts";
  import { updateControl, type UpdateCheck } from "./pwa.ts";

  const ETHOS =
    "no ads, no lives, no timers, nothing to buy, no accounts, no cookies, nothing sold or shared.";
  const SPEEDS: Speed[] = ["calm", "slow", "medium", "fast"];

  // progress: the furthest level unlocked, the level picked, the best score
  interface Progress { reached: number; level: number; best: number }
  const PROGRESS = "zap:progress";
  let progress = $state<Progress>(readJson<Progress>(PROGRESS, { reached: 1, level: 1, best: 0 }));
  const keep = () => (saved = writeJson(PROGRESS, progress));
  let saved = $state(true);

  // calm is the default: the capsule waits until you drop it
  const SPEED = "zap:speed";
  let speed = $state<Speed>(SPEEDS.includes(readSlot(SPEED) as Speed) ? (readSlot(SPEED) as Speed) : "calm");
  function pickSpeed(s: Speed) {
    speed = s;
    writeSlot(SPEED, s);
  }

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
    deal = d;
    mode = m;
    game = begin(d, speed);
    pops = [];
    chain = 0;
    screen = "play";
    frame++;
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
        pops = steps.flatMap((s) => s.cleared.map((i, k) => ({ i, color: s.colors[k] })));
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
    if (!game || game.status !== "playing" || sheet) return;
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

  // real-time gravity: the same fall at any frame rate; calm never falls
  let raf = 0;
  let last = 0;
  function loop(now: number) {
    if (game && screen === "play" && !sheet && game.status === "playing" && last) {
      const before = game.capsules;
      const y = game.active?.body.y;
      tick(game, Math.min(0.1, (now - last) / 1000));
      if (game.capsules !== before || game.active?.body.y !== y || game.status !== "playing") settled(before);
    }
    last = now;
    raf = requestAnimationFrame(loop);
  }

  // hold to repeat a slide; hold the drop button to ease the capsule down
  let repeat: ReturnType<typeof setTimeout> | undefined;
  function hold(fn: (g: Game) => unknown, first = 220, every = 90) {
    act(fn);
    clearTimeout(repeat);
    const again = () => {
      act(fn);
      repeat = setTimeout(again, every);
    };
    repeat = setTimeout(again, first);
  }
  let dropHeld = false;
  function dropDown() {
    dropHeld = false;
    clearTimeout(repeat);
    repeat = setTimeout(function ease() {
      dropHeld = true;
      act(nudge);
      repeat = setTimeout(ease, 70);
    }, 220);
  }
  function dropUp() {
    clearTimeout(repeat);
    if (!dropHeld) act(drop);
    dropHeld = false;
  }
  const release = () => clearTimeout(repeat);

  function key(e: KeyboardEvent) {
    if (screen !== "play" || sheet) return;
    const map: Record<string, (g: Game) => unknown> = {
      ArrowLeft: (g) => move(g, -1),
      ArrowRight: (g) => move(g, 1),
      ArrowUp: (g) => rotate(g, 1),
      x: (g) => rotate(g, 1),
      z: (g) => rotate(g, -1),
      ArrowDown: nudge,
      " ": drop,
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    act(fn);
  }

  // on the jar: a tap turns, a sideways drag slides a column at a time, a flick down drops
  let touch: { x: number; y: number; moved: boolean; start: number } | null = null;
  let jarEl = $state<SVGSVGElement>();
  const cellPx = () => (jarEl ? jarEl.getBoundingClientRect().width / 8 : 40);
  function down(e: PointerEvent) {
    touch = { x: e.clientX, y: e.clientY, moved: false, start: performance.now() };
  }
  function drag(e: PointerEvent) {
    if (!touch) return;
    const step = cellPx();
    while (e.clientX - touch.x >= step) (touch.x += step), (touch.moved = true), act((g) => move(g, 1));
    while (touch.x - e.clientX >= step) (touch.x -= step), (touch.moved = true), act((g) => move(g, -1));
  }
  function up(e: PointerEvent) {
    if (!touch) return;
    const fall = e.clientY - touch.y;
    if (fall > cellPx() * 1.5 && performance.now() - touch.start < 400) act(drop);
    else if (!touch.moved && Math.abs(fall) < 12) act((g) => rotate(g, 1));
    touch = null;
  }

  // play with friends: a link that opens the exact board, nothing else to it
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
    raf = requestAnimationFrame(loop);
    // a friend's link opens straight onto their board
    const q = new URLSearchParams(location.search);
    const seed = Number(q.get("seed")), level = Number(q.get("level")), v = Number(q.get("v") ?? 0);
    if (Number.isSafeInteger(seed) && seed > 0 && Number.isSafeInteger(level) && level >= 1 && level <= LEVELS && Number.isSafeInteger(v) && v >= 0)
      play(dealFor(seed, level, v), "friend");
  });
  onDestroy(() => {
    install?.dispose();
    updates?.dispose();
    cancelAnimationFrame(raf);
    clearTimeout(repeat);
    if (typeof removeEventListener === "function") removeEventListener("keydown", key);
  });
</script>

{#if screen === "menu"}
  <main class="menu">
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
        <button role="radio" aria-checked={speed === s} class:on={speed === s} onclick={() => pickSpeed(s)}>{s.toUpperCase()}</button>
      {/each}
    </div>
    <button id="daily" onclick={playDaily}>DAILY</button>
    <button id="friends" onclick={() => share(campaign(progress.level))}>PLAY WITH FRIENDS</button>
    <div class="row">
      <button id="howto" onclick={() => (sheet = "howto")}>HOW TO PLAY</button>
      <button id="looks" onclick={() => (sheet = "looks")}>LOOKS</button>
    </div>
    <div class="row">
      {#if installVisible}<button id="install" onclick={() => install.prompt()}>INSTALL</button>{/if}
      <button id="about" onclick={() => (sheet = "about")}>ABOUT</button>
    </div>
    {#if progress.best}<p class="best">best score {progress.best}</p>{/if}
    {#if !saved}<p class="warn">this browser is not saving progress</p>{/if}
  </main>
{:else if view}
  <main class="play">
    <header class="hud">
      <button class="back" aria-label="menu" onclick={() => (screen = "menu")}>☰</button>
      <div class="stat"><b>{mode === "daily" ? "DAILY" : mode === "friend" ? "FRIEND" : `LEVEL ${view.level}`}</b></div>
      <div class="stat" id="germs"><span>germs</span><b>{view.germs}</b></div>
      <div class="stat" id="score"><span>score</span><b>{view.score}</b></div>
      <div class="next" aria-label="next capsule"><svg viewBox="0 0 200 100">{@html view.next}</svg></div>
    </header>
    <div class="well">
      <svg
        bind:this={jarEl}
        id="jar"
        viewBox="0 0 800 1600"
        role="img"
        aria-label="the jar"
        onpointerdown={down}
        onpointermove={drag}
        onpointerup={up}
        onpointercancel={() => (touch = null)}>{@html view.markup}</svg
      >
      {#if chain > 1}<div class="chain">chain x{chain}!</div>{/if}
      {#if view.status === "won"}
        <div class="over" id="won">
          <h2>{mode === "campaign" ? "jar clear!" : "you zapped them all!"}</h2>
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
          <h2>the jar is full</h2>
          <p>no worries. same board, fresh go.</p>
          <button class="big" onclick={again}>TRY AGAIN</button>
          <button onclick={() => (screen = "menu")}>MENU</button>
        </div>
      {/if}
    </div>
    <nav class="pad" aria-label="controls">
      <button aria-label="left" onpointerdown={() => hold((g) => move(g, -1))} onpointerup={release} onpointerleave={release}>◀</button>
      <button aria-label="turn" onpointerdown={() => act((g) => rotate(g, 1))}
        ><svg class="turn" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button
      >
      <button aria-label="right" onpointerdown={() => hold((g) => move(g, 1))} onpointerup={release} onpointerleave={release}>▶</button>
      <button aria-label="drop" class="drop" onpointerdown={dropDown} onpointerup={dropUp} onpointerleave={release}>▼</button>
    </nav>
  </main>
{/if}

{#if toast}<div class="toast" role="status">{toast}</div>{/if}
{#if updateReady}<button class="update" onclick={applyUpdate}>NEW VERSION, TAP TO LOAD</button>{/if}

{#if sheet}
  <dialog bind:this={dialog} class="sheet" onclose={() => (sheet = "")}>
    <div class="card">
      {#if sheet === "howto"}
        <h2>how to play</h2>
        <p>capsules drop into the jar. each one has two halves.</p>
        <p><b>◀ ▶</b> slide it. the round arrow turns it. <b>▼</b> drops it. hold <b>▼</b> to ease it down.</p>
        <p>on the jar: tap to turn, drag to slide, flick down to drop.</p>
        <p>line up <b>four of one colour</b>, across or up and down, and they zap. germs count too.</p>
        <p>zap every germ to clear the jar. loose halves fall, and a fall that makes four again is a chain.</p>
        <p>each colour has its own shape: a circle, a triangle, a square.</p>
        <p><b>calm</b> waits for you. slow, medium and fast fall on their own, a bit faster each level.</p>
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
        <p>a cosy capsule puzzle. drop capsules into the jar, match four of a colour, and zap every germ. a new board every day, and one to send a friend.</p>
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
