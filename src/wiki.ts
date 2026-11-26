// "Any game" — pull a game's rules from Wikipedia (CC BY-SA 4.0), keep only the rules-ish
// sections, and index them on this device like any other rulebook. Every ruling credits the article.
import { gameFromWikiPage } from "./rules-text";
import type { Game } from "./store";

const API = "https://en.wikipedia.org/w/api.php";

export interface WikiHit {
  title: string;
  snippet: string;
}

function strip(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

/** Search Wikipedia for game articles. "game" is added so "Uno" finds the card game, not the number. */
export async function searchWiki(q: string): Promise<WikiHit[]> {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: /game|cards?|board|dice|sport/i.test(q) ? q : `${q} game rules`,
    srlimit: "6",
    format: "json",
    origin: "*",
  }).toString();
  const j = await (await fetch(u)).json();
  return (j.query?.search ?? []).map((s: { title: string; snippet: string }) => ({
    title: s.title,
    snippet: strip(s.snippet),
  }));
}

/** Fetch an article's plain text and turn its rules sections into a local Game. */
export async function gameFromWiki(title: string): Promise<Game> {
  const u = new URL(API);
  u.search = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    inprop: "url",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    titles: title,
    format: "json",
    origin: "*",
  }).toString();
  const j = await (await fetch(u)).json();
  const page = Object.values(j.query?.pages ?? {})[0] as { title: string; extract?: string; fullurl?: string; missing?: string } | undefined;
  if (!page || page.missing !== undefined || !page.extract) throw new Error(`Wikipedia has no article called "${title}"`);
  return gameFromWikiPage({ title: page.title, extract: page.extract, fullurl: page.fullurl });
}