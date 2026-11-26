// Local rulebook library: everything lives in IndexedDB on this device.
import { get, set, del, keys } from "idb-keyval";

export interface Section {
  id: string;
  title: string;
  text: string;
}
export interface HouseRule {
  id: string;
  name: string;
  text: string;
  active: boolean;
  source: "custom" | "found";
}
export interface Game {
  id: string;
  name: string;
  sections: Section[];
  houseRules: HouseRule[];
  origin: "sample" | "pdf-cloud" | "pdf-local" | "text-local" | "wikipedia";
  addedAt: number;
  /** Where the rules text came from, when it needs attribution (Wikipedia: CC BY-SA 4.0). */
  source?: { title: string; url: string; license: string; licenseUrl: string };
  /** Built-in library game (public/games.json); only saved to this device once you change it. */
  library?: boolean;
  category?: string;
  /** Saved beginner lesson, so it opens instantly and offline next time. */
  lesson?: import("./referee").Lesson;
}

const PREFIX = "game:";

export async function saveGame(g: Game): Promise<void> {
  await set(PREFIX + g.id, g);
}
export async function loadGame(id: string): Promise<Game | undefined> {
  return get<Game>(PREFIX + id);
}
export async function deleteGame(id: string): Promise<void> {
  await del(PREFIX + id);
}
export async function listGames(): Promise<Game[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith(PREFIX));
  const games = await Promise.all(ks.map((k) => get<Game>(k)));
  return games.filter((g): g is Game => !!g).sort((a, b) => a.addedAt - b.addedAt);
}

export { slug } from "./rules-text";

// ---------- Retrieval (BM25) so the on-device model only sees the rules that matter ----------

const STOP = new Set(
  "a an the and or of to in on at for is are be can i my you your it this that with as by if when do does may must from not".split(" ")
);
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ing|es|s)$/, ""));
}

/** Top sections for a question, capped by a character budget that fits Gemini Nano's context. */
export function retrieve(game: Game, question: string, k = 6, charBudget = 9000): Section[] {
  const docs = game.sections.map((s) => tokens(`${s.title} ${s.title} ${s.text}`));
  const N = docs.length || 1;
  const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const q = tokens(question);
  const scored = docs.map((d, i) => {
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avg))));
    }
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: Section[] = [];
  let used = 0;
  for (const { i, score } of scored) {
    if (out.length >= k) break;
    if (score <= 0 && out.length >= 2) break;
    const s = game.sections[i];
    const len = s.title.length + s.text.length + 12;
    if (used + len > charBudget) continue;
    out.push(s);
    used += len;
  }
  return out;
}
