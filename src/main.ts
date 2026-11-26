import "./style.css";
import type { Part } from "firebase/ai";
import { loadSettings, onDeviceStatus, downloadOnDeviceModel, isNativeApp, isBusyError } from "./firebase";
import { listGames, saveGame, deleteGame, type Game, type HouseRule } from "./store";
import { SAMPLES } from "./samples";
import { gameFromPdf, gameFromText } from "./ingest";
import { callIt, appeal, needsAppeal, findVariations, teach, isTeachQuestion, type Ruling, type Lesson } from "./referee";
import { zeb, line, whistle, preloadZeb, type Mood } from "./mascot";
import { searchWiki, gameFromWiki } from "./wiki";
import {
  playClip, stopClip, clipsOn, speak,
  canListen, listenOnce, startWakeWord, stopWakeWord, usingLocalSpeech, type Clip,
} from "./fun";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let games: Game[] = [];
let game: Game;
let photo: Part | undefined;
const history: { gameId: string; r: Ruling }[] = [];

// ---------------- Zeb the Ref ----------------
function setZeb(mood: Mood, text = line(mood)) {
  $("zeb-stage").innerHTML = zeb(mood);
  const b = $("zeb-bubble");
  b.className = `bubble ${mood}`;
  b.textContent = text;
  void b.offsetWidth; // restart the pop animation
  b.classList.add("pop");
}
const verdictMood = (r: Ruling): Mood => (r.verdict === "YES" ? "yes" : r.verdict === "NO" ? "no" : "depends");
const isCardGame = () => /\b(eights?|uno|cards?|poker|rummy|hearts|spades|gin|bridge|euchre|cribbage|solitaire|blackjack|war|go fish|canasta|pinochle|skat|whist)\b/i.test(game.name);

function react(r: Ruling, first?: Ruling) {
  if (first) {
    const reversed = first.verdict !== r.verdict;
    const mood: Mood = reversed ? "overturned" : "upheld";
    const said = line(mood);
    setZeb(mood, said);
    whistle(reversed ? 2 : 1);
    stopClip(400);
    setTimeout(() => speak(`${said} ${r.ruling}`), reversed ? 700 : 400);
    return;
  }
  const mood = verdictMood(r);
  const said = line(mood);
  setZeb(mood, said);
  const clip: Clip | null = mood === "no" ? "whistle" : mood === "yes" ? (isCardGame() ? "cards" : "cheer") : null;
  if (clip) playClip(clip, mood === "no" ? "Foul!" : "Play on!");
  if (mood === "no") whistle(2);
  else if (mood === "yes") whistle(1);
  setTimeout(() => speak(`${said} ${r.ruling}`), mood === "no" ? 750 : 350);
}

function renderMute() {
  let muted = false;
  try { muted = localStorage.getItem("gameref:muted") === "1"; } catch { /* ignore */ }
  $("btn-mute").textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
  $("btn-clips").textContent = clipsOn() ? "🎬 Clips on" : "🎬 Clips off";
}
$("btn-clips").onclick = () => {
  try { localStorage.setItem("gameref:clips", clipsOn() ? "0" : "1"); } catch { /* ignore */ }
  if (!clipsOn()) stopClip();
  renderMute();
};
$("btn-mute").onclick = () => {
  try {
    const muted = localStorage.getItem("gameref:muted") === "1";
    localStorage.setItem("gameref:muted", muted ? "0" : "1");
    if (muted) whistle(1);
  } catch { /* ignore */ }
  renderMute();
};

// ---------------- status chips ----------------
async function refreshStatus() {
  const chip = $("chip-device");
  const st = await onDeviceStatus();
  const btn = $("btn-download");
  const map: Record<string, [string, string]> = {
    available: ["ok", "On-device: Gemini Nano ready"],
    downloadable: ["warn", "On-device: model not downloaded"],
    downloading: ["warn", "On-device: downloading..."],
    unavailable: ["off", isNativeApp ? "On-device: this phone has no Gemini Nano (cloud only)" : "On-device: unavailable (cloud only)"],
    unsupported: ["off", "On-device: not supported in this browser (cloud only)"],
  };
  const [cls, label] = map[st] ?? ["off", `On-device: ${st}`];
  chip.className = `chip ${cls}`;
  chip.textContent = label;
  btn.classList.toggle("hidden", st !== "downloadable");
  const net = $("chip-net");
  net.className = `chip ${navigator.onLine ? "ok" : "warn"}`;
  net.textContent = navigator.onLine ? "Online: cloud appeals on" : "Offline: on-device only";
}

$("btn-download").onclick = async () => {
  const btn = $<HTMLButtonElement>("btn-download");
  btn.disabled = true;
  try {
    await downloadOnDeviceModel((p) => (btn.textContent = `Downloading ${p}%`));
  } catch (e) {
    alertError(e);
  }
  btn.disabled = false;
  btn.textContent = "Download on-device model";
  refreshStatus();
};
addEventListener("online", refreshStatus);
addEventListener("offline", refreshStatus);

// ---------------- library ----------------
// The built-in library ships with the app (public/games.json, built by tools/bundle-games.ts).
let builtIn: Game[] | null = null;
let savedIds = new Set<string>();
async function libraryGames(): Promise<Game[]> {
  if (builtIn) return builtIn;
  try {
    builtIn = (await (await fetch("/games.json")).json()) as Game[];
  } catch {
    builtIn = []; // not cached yet and offline: the games on this device still work
  }
  return builtIn;
}

async function loadLibrary(selectId?: string) {
  const stored = await listGames();
  const ids = new Set(stored.map((g) => g.id));
  for (const s of SAMPLES) if (!ids.has(s.id)) await saveGame(structuredClone(s));
  const mine = await listGames();
  const mineIds = new Set(mine.map((g) => g.id));
  savedIds = mineIds;
  const lib = (await libraryGames()).filter((g) => !mineIds.has(g.id));
  games = [...mine, ...lib];
  const opt = (g: Game) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`;
  const byName = (a: Game, b: Game) => a.name.localeCompare(b.name);
  const groups = new Map<string, Game[]>();
  for (const g of lib) groups.set(g.category ?? "More games", [...(groups.get(g.category ?? "More games") ?? []), g]);
  const sel = $<HTMLSelectElement>("game-select");
  sel.innerHTML =
    `<optgroup label="Your games">${mine.map(opt).join("")}</optgroup>` +
    [...groups].map(([cat, gs]) => `<optgroup label="${esc(cat)} (${gs.length})">${gs.sort(byName).map(opt).join("")}</optgroup>`).join("");
  const want = selectId ?? localStorage.getItem("gameref:last") ?? games[0]?.id;
  sel.value = games.some((g) => g.id === want) ? want! : games[0].id;
  selectGame(sel.value);
}

function selectGame(id: string) {
  game = games.find((g) => g.id === id)!;
  try { localStorage.setItem("gameref:last", id); } catch { /* storage may be blocked */ }
  const originLabel: Record<Game["origin"], string> = {
    sample: "built-in rulebook",
    "pdf-cloud": "PDF read by the cloud",
    "pdf-local": "PDF read on this device",
    "text-local": "text indexed on this device",
    wikipedia: "from Wikipedia",
  };
  $("game-meta").innerHTML = `${game.sections.length} rule sections · ${esc(originLabel[game.origin])}${creditHtml()}`;
  // Built-in games can't be deleted; a library game you changed can be reset (deleted back to the original).
  $("btn-delete").classList.toggle("hidden", game.origin === "sample" || (!!game.library && !savedIds.has(game.id)));
  $("ruling").innerHTML = "";
  $("variations-out").innerHTML = "";
  setZeb("idle", `I'm Zeb. Ask me anything about ${game.name}.`);
  renderHouse();
  renderRulebook();
  renderHistory();
  walk = null;
  renderLesson();
}
$<HTMLSelectElement>("game-select").onchange = (e) => selectGame((e.target as HTMLSelectElement).value);

$("btn-delete").onclick = async () => {
  await deleteGame(game.id);
  await loadLibrary();
};

/** CC BY-SA credit for Wikipedia-sourced rules (shown under the game and on every ruling). */
function creditHtml(): string {
  const s = game?.source;
  if (!s) return "";
  return ` <span class="credit">· Rules text: <a href="${esc(s.url)}" target="_blank" rel="noopener">"${esc(s.title)}" on Wikipedia</a>, <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a> (excerpted)</span>`;
}

// ---------------- any game from Wikipedia ----------------
async function runWikiSearch() {
  const q = $<HTMLInputElement>("wiki-q").value.trim();
  const out = $("wiki-results");
  if (!q) return $("wiki-q").focus();
  if (!navigator.onLine) return (out.innerHTML = `<p class="muted">Finding new games needs the internet. Games you've already added work offline.</p>`);
  out.innerHTML = `<div class="thinking">Looking up "${esc(q)}" on Wikipedia</div>`;
  try {
    const hits = await searchWiki(q);
    out.innerHTML = hits.length
      ? hits
          .map(
            (h, i) => `<div class="wiki-hit"><div><b>${esc(h.title)}</b><span class="muted">${esc(h.snippet)}</span></div>
            <button class="ghost small" data-w="${i}">+ Add</button></div>`
          )
          .join("")
      : `<p class="muted">Nothing found. Try the game's full name.</p>`;
    out.querySelectorAll<HTMLButtonElement>("button[data-w]").forEach((b) => {
      b.onclick = async () => {
        const hit = hits[Number(b.dataset.w)];
        b.disabled = true;
        b.textContent = "Reading...";
        try {
          const g = await gameFromWiki(hit.title);
          await saveGame(g);
          out.innerHTML = `<p class="muted">Added ${esc(g.name)}: ${g.sections.length} rule sections, now stored on this device.</p>`;
          $("add-panel").classList.add("hidden");
          await loadLibrary(g.id);
          setZeb("yes", `Got the ${g.name} rules from Wikipedia. Ask away!`);
          speak(`Got the ${g.name} rules. Ask away!`);
        } catch (e) {
          b.disabled = false;
          b.textContent = "+ Add";
          out.insertAdjacentHTML("afterbegin", `<p class="error">${esc((e as Error).message)}</p>`);
        }
      };
    });
  } catch (e) {
    out.innerHTML = `<p class="error">Couldn't reach Wikipedia: ${esc((e as Error).message)}</p>`;
  }
}
$("btn-wiki").onclick = runWikiSearch;
$<HTMLInputElement>("wiki-q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runWikiSearch();
});

// ---------------- add rulebook ----------------
$("btn-add").onclick = () => {
  $("add-panel").classList.toggle("hidden");
  if (!$("add-panel").classList.contains("hidden")) $("wiki-q").focus();
};
$("btn-add-cancel").onclick = () => $("add-panel").classList.add("hidden");
$("btn-add-go").onclick = async () => {
  const name = $<HTMLInputElement>("add-name").value.trim();
  const file = $<HTMLInputElement>("add-pdf").files?.[0];
  const text = $<HTMLTextAreaElement>("add-text").value.trim();
  const status = $("add-status");
  if (!name) return (status.textContent = "Give the game a name first.");
  if (!file && !text) return (status.textContent = "Choose a PDF or paste the rules.");
  const btn = $<HTMLButtonElement>("btn-add-go");
  btn.disabled = true;
  try {
    const g = file ? await gameFromPdf(file, name, (s) => (status.textContent = s)) : gameFromText(text, name);
    await saveGame(g);
    status.textContent = `Added ${g.sections.length} rule sections.`;
    $<HTMLInputElement>("add-name").value = "";
    $<HTMLInputElement>("add-pdf").value = "";
    $<HTMLTextAreaElement>("add-text").value = "";
    $("add-panel").classList.add("hidden");
    await loadLibrary(g.id);
  } catch (e) {
    status.textContent = `Couldn't add it: ${(e as Error).message}`;
  }
  btn.disabled = false;
};

// ---------------- photo ----------------
async function toJpegPart(file: File): Promise<{ part: Part; url: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { part: { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: url.split(",")[1] } }, url };
}
$<HTMLInputElement>("photo").onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const { part, url } = await toJpegPart(f);
  photo = part;
  const img = $<HTMLImageElement>("photo-preview");
  img.src = url;
  img.classList.remove("hidden");
  $("photo-clear").classList.remove("hidden");
};
$("photo-clear").onclick = () => {
  photo = undefined;
  $<HTMLInputElement>("photo").value = "";
  $("photo-preview").classList.add("hidden");
  $("photo-clear").classList.add("hidden");
};

// ---------------- rulings ----------------
function sourceBadge(r: Ruling): string {
  const where = r.source === "on_device" ? "⚡ On-device · Gemini Nano" : "☁️ Cloud · Gemini";
  const stage = r.stage === "appeal" ? `<span class="badge appeal">⚖️ Appeal</span>` : "";
  return `${stage}<span class="badge ${r.source}">${where}</span><span class="badge plain">${r.ms} ms</span><span class="badge plain">confidence ${Math.round(r.confidence * 100)}%</span>`;
}

function rulingHtml(r: Ruling, first?: Ruling): string {
  const label = { YES: "✅ YES", NO: "⛔ NO", DEPENDS: "⚠️ IT DEPENDS" }[r.verdict];
  const byId = new Map(game.sections.map((s) => [s.id, s]));
  // Models often cite sub-rules ("7.2") inside a section stored as "7" - resolve to the closest section.
  const resolve = (raw: string) => {
    const id = raw.replace(/^[[§\s]+|[\]\s]+$/g, "");
    if (byId.has(id)) return byId.get(id);
    const parts = id.split(".");
    for (let n = parts.length - 1; n > 0; n--) {
      const s = byId.get(parts.slice(0, n).join("."));
      if (s) return s;
    }
    return game.sections.find((s) => s.text.includes(`${id} `));
  };
  const seen = new Set<string>();
  const cites = r.citedRuleIds
    .filter((id) => {
      const key = id.toUpperCase() === "HOUSE" ? "HOUSE" : resolve(id)?.id ?? id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((id) => {
      if (id.toUpperCase() === "HOUSE") {
        const on = game.houseRules.filter((h) => h.active);
        return `<details><summary>House rules</summary><div class="cite-text">${esc(on.map((h) => `${h.name}: ${h.text}`).join("\n") || "none active")}</div></details>`;
      }
      const s = resolve(id);
      return s ? `<details><summary>Rule ${esc(id)} · ${esc(s.title)}</summary><div class="cite-text">${esc(s.text)}</div></details>` : "";
    })
    .join("");
  const overturned = first && first.verdict !== r.verdict ? `<p class="muted">Appeal overturned the first call (${esc(first.verdict.replace("_", " "))}).</p>` : first ? `<p class="muted">Appeal upheld the first call.</p>` : "";
  const canAppeal = r.stage === "first" && navigator.onLine;
  return `<div class="ruling ${r.verdict}">
    <div class="verdict">${label}</div>
    <p class="said">${esc(r.ruling)}</p>
    <p class="muted">${esc(r.explanation)}</p>
    ${overturned}
    <div class="meta">${sourceBadge(r)}${canAppeal ? `<button class="flag" id="btn-appeal">🚩 Throw the challenge flag</button>` : ""}</div>
    <div class="cites">${cites}</div>
    ${game.source ? `<p class="credit">${creditHtml().replace(/^ ?<span class="credit">· /, "").replace(/<\/span>$/, "")}</p>` : ""}
  </div>`;
}

// ---------------- Challenge flag (no names, no scores) ----------------
function wireFlag(first: Ruling) {
  const btn = $<HTMLButtonElement>("btn-appeal");
  if (btn) btn.onclick = () => throwFlag(first);
}

function throwFlag(first: Ruling) {
  const btn = $<HTMLButtonElement>("btn-appeal");
  const r = btn?.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "flag-throw";
  f.textContent = "🚩";
  f.style.left = `${(r?.left ?? innerWidth / 2) + (r?.width ?? 0) / 2 - 32}px`;
  f.style.top = `${(r?.top ?? innerHeight / 2) - 20}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
  whistle(1);
  btn?.remove();
  speak("Challenge flag! Going to the replay booth.");
  runAppeal(first);
}

let lastFirst: Ruling | undefined;
let lastPhoto: Part | undefined;

async function runAppeal(first: Ruling) {
  const box = $("ruling");
  box.insertAdjacentHTML("beforeend", `<div class="thinking" id="appeal-thinking">Sending it up to the cloud appeals referee (full rulebook)</div>`);
  setZeb("appeal");
  playClip("replay", "Under review", true);
  try {
    const r = await appeal(game, first, lastPhoto);
    box.innerHTML = rulingHtml(r, first);
    pushHistory(r);
    react(r, first);
  } catch (e) {
    stopClip();
    $("appeal-thinking")?.remove();
    setZeb("depends", "The replay booth is down. The first call stands for now.");
    box.insertAdjacentHTML("beforeend", `<p class="error">Appeal failed: ${esc((e as Error).message)}</p>`);
  }
}

// ---------------- Learn to play: lessons + a spoken walkthrough ----------------
let walk: { steps: string[]; i: number } | null = null;

function lessonSteps(l: Lesson): string[] {
  return [
    `The goal: ${l.goal}`,
    l.needs ? `You need: ${l.needs}` : "",
    ...l.setup.map((s, i) => `Setup, step ${i + 1}: ${s}`),
    ...l.turn.map((s, i) => `On your turn, step ${i + 1}: ${s}`),
    `How it ends: ${l.winning}`,
    ...l.tips.map((s) => `Beginner tip: ${s}`),
  ].filter(Boolean);
}

function renderLesson() {
  $("learn-game").textContent = game.name;
  const l = game.lesson;
  $("btn-teach").textContent = l ? "Rewrite lesson" : "Teach me this game";
  if (!l) {
    $("lesson").innerHTML = "";
    return;
  }
  const ol = (items: string[]) => `<ol>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  const where = l.source === "on_device" ? "⚡ Written on-device · Gemini Nano" : "☁️ Written in the cloud · Gemini";
  $("lesson").innerHTML = `<div class="lesson">
    <p class="goal"><b>Goal:</b> ${esc(l.goal)}</p>
    ${l.needs ? `<p><b>You need:</b> ${esc(l.needs)}</p>` : ""}
    ${l.setup.length ? `<h3>Set up</h3>${ol(l.setup)}` : ""}
    ${l.turn.length ? `<h3>On your turn</h3>${ol(l.turn)}` : ""}
    <h3>How it ends</h3><p>${esc(l.winning)}</p>
    ${l.tips.length ? `<h3>Beginner mistakes</h3><ul>${l.tips.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    <div class="meta"><span class="badge ${l.source}">${where}</span><span class="badge plain">${l.ms} ms</span>
      ${l.citedRuleIds.length ? `<span class="badge plain">From rules ${esc(l.citedRuleIds.slice(0, 6).join(", "))}</span>` : ""}</div>
    <div class="row walk">
      <button id="btn-walk" class="primary">▶ Walk me through it</button>
      <button id="btn-walk-back" class="ghost hidden">◀ Back</button>
      <button id="btn-walk-next" class="ghost hidden">Next ▶</button>
      <span class="muted" id="walk-pos"></span>
    </div>
    <p class="walk-step hidden" id="walk-step"></p>
    ${game.source ? `<p class="credit">${creditHtml().replace(/^ ?<span class="credit">· /, "").replace(/<\/span>$/, "")}</p>` : ""}
  </div>`;
  $("btn-walk").onclick = () => {
    walk = { steps: lessonSteps(l), i: 0 };
    $("btn-walk").classList.add("hidden");
    $("btn-walk-back").classList.remove("hidden");
    $("btn-walk-next").classList.remove("hidden");
    showStep();
  };
  $("btn-walk-back").onclick = () => {
    if (!walk) return;
    walk.i = Math.max(walk.i - 1, 0);
    showStep();
  };
  $("btn-walk-next").onclick = () => {
    if (!walk) return;
    if (walk.i === walk.steps.length - 1) {
      walk = null;
      const bye = `That's ${game.name}! Ask me anything while you play.`;
      setZeb("yes", bye);
      speak(bye);
      renderLesson();
      return;
    }
    walk.i++;
    showStep();
  };
}

function showStep() {
  if (!walk) return;
  const s = walk.steps[walk.i];
  const el = $("walk-step");
  el.textContent = s;
  el.classList.remove("hidden");
  $("walk-pos").textContent = `Step ${walk.i + 1} of ${walk.steps.length}`;
  $("btn-walk-next").textContent = walk.i === walk.steps.length - 1 ? "Done ✓" : "Next ▶";
  setZeb("idle", s);
  speak(s);
}

async function runLesson() {
  const btn = $<HTMLButtonElement>("btn-teach");
  btn.disabled = true;
  walk = null;
  $("learn-card").scrollIntoView({ behavior: "smooth", block: "start" });
  $("lesson").innerHTML = `<div class="thinking">Zeb is reading the ${esc(game.name)} rulebook</div>`;
  setZeb("thinking", `Let me teach you ${game.name}. Reading the rulebook...`);
  try {
    const l = await teach(game, () => {
      $("lesson").innerHTML = `<div class="thinking">On-device model is still warming up - handing the lesson to the cloud</div>`;
    });
    game.lesson = l;
    await saveGame(game);
    savedIds.add(game.id);
    renderLesson();
    setZeb("yes", `Here's how to play ${game.name}. Tap "Walk me through it" and I'll take you step by step.`);
    speak(`Here's how to play ${game.name}. ${l.goal}`);
  } catch (e) {
    $("lesson").innerHTML = `<p class="error">${esc(friendly(e))}</p>`;
    setZeb("depends", "I couldn't write that lesson. Try again in a moment.");
  }
  btn.disabled = false;
}
$("btn-teach").onclick = runLesson;

$("btn-call").onclick = async () => {
  const q = $<HTMLTextAreaElement>("question").value.trim();
  if (!q) return $("question").focus();
  const btn = $<HTMLButtonElement>("btn-call");
  const box = $("ruling");
  // "How do you play gin?" wants a lesson, not a YES/NO ruling.
  if (isTeachQuestion(q) && !photo) {
    box.innerHTML = `<p class="muted">That's a how-to-play question, so Zeb is teaching it below in Learn to play.</p>`;
    if (game.lesson) {
      $("learn-card").scrollIntoView({ behavior: "smooth", block: "start" });
      setZeb("yes", `Here's how to play ${game.name}. Tap "Walk me through it" and I'll take you step by step.`);
      speak(`Here's how to play ${game.name}. ${game.lesson.goal}`);
    } else await runLesson();
    return;
  }
  btn.disabled = true;
  box.innerHTML = `<div class="thinking">The ref is checking ${game.sections.length} rules</div>`;
  setZeb("thinking");
  stopClip();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  try {
    lastPhoto = photo;
    const r = await callIt(game, q, photo, () => {
      box.innerHTML = `<div class="thinking">On-device model is still warming up - handing this call to the cloud</div>`;
      setZeb("thinking", "My on-device brain is still warming up - phoning the cloud!");
    });
    lastFirst = r;
    box.innerHTML = rulingHtml(r);
    pushHistory(r);
    react(r);
    wireFlag(r);
    if (needsAppeal(r, !!lastPhoto) && navigator.onLine) {
      $("btn-appeal")?.remove();
      const why = lastPhoto ? "Photo ruling - getting a second look from the cloud referee." : "Low confidence on the first call - escalating automatically.";
      box.insertAdjacentHTML("beforeend", `<p class="muted">${why}</p>`);
      await runAppeal(r);
    }
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(friendly(e))}</p>`;
    setZeb("depends", "I couldn't make that call. Try asking again.");
  }
  btn.disabled = false;
  refreshStatus();
};
$<HTMLTextAreaElement>("question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("btn-call").click();
});

function friendly(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (!navigator.onLine) return `The on-device model couldn't make this call and you're offline. (${m})`;
  if (isBusyError(e))
    return "Google's cloud models are swamped right now. Zeb tried both of them a few times. Wait a minute and ask again.";
  return `The ref couldn't make that call: ${m}`;
}
function alertError(e: unknown) {
  $("ruling").innerHTML = `<p class="error">${esc((e as Error).message ?? String(e))}</p>`;
}

function pushHistory(r: Ruling) {
  history.unshift({ gameId: game.id, r });
  if (history.length > 30) history.pop();
  renderHistory();
}
function renderHistory() {
  const items = history.filter((h) => h.gameId === game.id);
  $("history").innerHTML = items.length
    ? items
        .map(
          (h, i) =>
            `<li data-i="${i}"><span class="v">${h.r.verdict.replace("_", " ")}</span>${esc(h.r.question)} <span class="badge ${h.r.source}">${h.r.source === "on_device" ? "on-device" : "cloud"}${h.r.stage === "appeal" ? " appeal" : ""}</span></li>`
        )
        .join("")
    : `<li class="muted">No calls yet for this game.</li>`;
  $("history")
    .querySelectorAll<HTMLLIElement>("li[data-i]")
    .forEach(
      (li) =>
        (li.onclick = () => {
          const r = items[Number(li.dataset.i)].r;
          $("ruling").innerHTML = rulingHtml(r);
          if (r.stage === "first") wireFlag(r);
        })
    );
}

// ---------------- house rules & variations ----------------
async function persist() {
  await saveGame(game);
}
function renderHouse() {
  $("house-list").innerHTML = game.houseRules.length
    ? game.houseRules
        .map(
          (h) => `<li><input type="checkbox" data-id="${esc(h.id)}" ${h.active ? "checked" : ""} aria-label="Use ${esc(h.name)}" />
        <div class="txt"><span class="name">${esc(h.name)}</span><span class="tag">${h.source === "found" ? "found variation" : "custom"}</span><div class="muted">${esc(h.text)}</div></div>
        <button class="ghost small" data-del="${esc(h.id)}" aria-label="Delete">✕</button></li>`
        )
        .join("")
    : `<li class="muted">Playing strictly by the book.</li>`;
  $("house-list").querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
    cb.onchange = async () => {
      game.houseRules.find((h) => h.id === cb.dataset.id)!.active = cb.checked;
      await persist();
    };
  });
  $("house-list").querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((b) => {
    b.onclick = async () => {
      game.houseRules = game.houseRules.filter((h) => h.id !== b.dataset.del);
      await persist();
      renderHouse();
    };
  });
}
function addHouse(name: string, text: string, source: HouseRule["source"], active = true) {
  game.houseRules.push({ id: crypto.randomUUID(), name, text, active, source });
}
$("btn-house-add").onclick = async () => {
  const n = $<HTMLInputElement>("house-name");
  const t = $<HTMLInputElement>("house-text");
  if (!n.value.trim() || !t.value.trim()) return;
  addHouse(n.value.trim(), t.value.trim(), "custom");
  n.value = t.value = "";
  await persist();
  renderHouse();
};

$("btn-variations").onclick = async () => {
  const out = $("variations-out");
  if (!navigator.onLine) return (out.innerHTML = `<p class="muted">Finding variations needs the cloud - connect to the internet.</p>`);
  const btn = $<HTMLButtonElement>("btn-variations");
  btn.disabled = true;
  out.innerHTML = `<div class="thinking">Searching for official variants, FAQs and popular house rules for ${esc(game.name)}</div>`;
  try {
    const v = await findVariations(game);
    const have = new Set(game.houseRules.map((h) => h.name.toLowerCase()));
    out.innerHTML =
      (v.variations.length
        ? v.variations
            .map(
              (x, i) => `<div class="variation"><div><b>${esc(x.name)}</b><div class="muted">${esc(x.text)}</div></div>
              <button class="ghost small" data-v="${i}" ${have.has(x.name.toLowerCase()) ? "disabled" : ""}>${have.has(x.name.toLowerCase()) ? "Added" : "+ Use"}</button></div>`
            )
            .join("")
        : `<p class="muted">No variations found.</p>`) +
      (v.grounded ? "" : `<p class="muted">From Gemini's knowledge (web search unavailable right now) - double-check official FAQs.</p>`) +
      (v.sources.length
        ? `<div class="sources">Sources: ${v.sources.slice(0, 6).map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || "source")}</a>`).join("")}</div>`
        : "") +
      (v.searchWidgetHtml ? `<iframe class="search-widget" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Google Search suggestions"></iframe>` : "");
    const frame = out.querySelector<HTMLIFrameElement>("iframe.search-widget");
    if (frame && v.searchWidgetHtml) frame.srcdoc = v.searchWidgetHtml;
    out.querySelectorAll<HTMLButtonElement>("button[data-v]").forEach((b) => {
      b.onclick = async () => {
        const x = v.variations[Number(b.dataset.v)];
        addHouse(x.name, x.text, "found");
        b.disabled = true;
        b.textContent = "Added";
        await persist();
        renderHouse();
      };
    });
  } catch (e) {
    out.innerHTML = `<p class="error">Couldn't search: ${esc((e as Error).message)}</p>`;
  }
  btn.disabled = false;
};

function renderRulebook() {
  $("rulebook").innerHTML = game.sections
    .map((s) => `<li><b>${esc(s.id)}</b><strong>${esc(s.title)}</strong><div class="muted">${esc(s.text)}</div></li>`)
    .join("");
}

// ---------------- ask out loud / "Hey Zeb" ----------------
function askAloud(q: string) {
  $<HTMLTextAreaElement>("question").value = q;
  $("btn-call").click();
}
if (isNativeApp) {
  // No speech recognition in the Android WebView: hide the voice buttons instead of failing on tap.
  $("btn-mic").classList.add("hidden");
  $("btn-wake").classList.add("hidden");
}
$("btn-mic").onclick = async () => {
  if (!canListen()) return setZeb("depends", "This browser can't listen. Type your question instead.");
  const b = $<HTMLButtonElement>("btn-mic");
  b.classList.add("listening");
  b.textContent = "🎤 Listening...";
  setZeb("thinking", "I'm listening. Ask your question.");
  try {
    const q = await listenOnce();
    if (q) askAloud(q);
    else setZeb("depends", "I didn't hear a question. Try again?");
  } catch (e) {
    setZeb("depends", (e as Error).message);
  }
  b.classList.remove("listening");
  b.textContent = "🎤 Ask out loud";
};
let wakeOn = false;
$("btn-wake").onclick = async () => {
  const b = $<HTMLButtonElement>("btn-wake");
  if (!canListen()) return setZeb("depends", "This browser can't listen. Type your question instead.");
  if (wakeOn) {
    wakeOn = false;
    stopWakeWord();
    b.classList.remove("listening");
    b.textContent = "👂 Hey Zeb: off";
    return;
  }
  wakeOn = await startWakeWord(
    (q) => askAloud(q),
    () => {
      setZeb("thinking", "Yes? What's the question?");
      speak("Yes?");
    }
  );
  if (wakeOn) {
    b.classList.add("listening");
    b.textContent = "👂 Hey Zeb: on";
    setZeb("idle", `Say "Hey Zeb" and then your question.${usingLocalSpeech() ? " Listening on this device." : ""}`);
  }
};

// ---------------- boot ----------------
(async () => {
  $("brand-zeb").innerHTML = zeb("idle", { headOnly: true });
  const icon = document.querySelector<HTMLLinkElement>("link[rel=icon]");
  if (icon) icon.href = "/zeb/favicon.png";
  preloadZeb();
  renderMute();
  // The old "Rules Lawyer of the Night" scoreboard kept player names; clear anything it left behind.
  try { localStorage.removeItem("gameref:night"); } catch { /* storage may be blocked */ }
  setZeb("idle");
  // First visit this session: Zeb waves hello on the jumbotron.
  try {
    if (!sessionStorage.getItem("gameref:waved")) {
      sessionStorage.setItem("gameref:waved", "1");
      playClip("wave", "Meet Zeb the Ref");
    }
  } catch { /* ignore */ }
  refreshStatus();
  await loadSettings();
  await loadLibrary();
  void lastFirst;
})();
