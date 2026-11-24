// "Any game" — pull a game's rules from Wikipedia (CC BY-SA 4.0), keep only the rules-ish
// sections, and index them on this device like any other rulebook. Every ruling credits the article.
import { chunkText } from "./ingest";
import { slug, type Game } from "./store";

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

// Sections worth keeping for a referee, and ones to drop.
const KEEP = /rule|play|game ?play|scor|set ?up|setup|deal|turn|move|win|end|object|equipment|component|card|piece|special|variant|variation|house|penalt|foul|official|tournament|strategy|terminology|glossary|how/i;
const DROP = /^(history|origin|etymology|reception|legacy|in popular culture|popular culture|culture|media|see also|references|notes|footnotes|further reading|external links|bibliography|sources|awards|sales|development|publication|release|editions?|merchandise|video games?|adaptations?|competitions? results|world champions?)$/i;

// Spin-offs, media and merchandise that share a word with "rules" but aren't rules.
const NOISE = /adaptation|game show|slot machine|film|television|\btv\b|fandom|series|merchandis|deck styles|card and deck|h2o|app|video game|online|tournaments? held|records?|celebrit|controvers|lawsuit|sponsor/i;

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

  // Split on "== Heading ==" (any level) and keep the intro + rules-like sections.
  const parts = page.extract.split(/\n(?===+ [^=]+ =+\s*\n)/);
  const kept: string[] = [];
  let parentKept = false;
  for (const part of parts) {
    const m = part.match(/^(=+) ([^=]+?) =+\s*\n/);
    if (!m) {
      kept.push(`## Overview\n${part.trim()}`);
      continue;
    }
    const heading = m[2].trim();
    const body = part.slice(m[0].length).trim();
    const junk = DROP.test(heading) || NOISE.test(heading);
    const keep: boolean = !junk && (KEEP.test(heading) || (m[1].length > 2 && parentKept));
    if (m[1].length <= 2) parentKept = keep;
    if (keep && body) kept.push(`## ${heading}\n${body}`);
  }
  // Nothing matched the rules filter: fall back to everything except the dropped sections.
  let text = kept.join("\n\n");
  if (kept.length <= 1) {
    text = parts
      .map((p) => {
        const m = p.match(/^(=+) ([^=]+?) =+\s*\n/);
        return m ? (DROP.test(m[2].trim()) || NOISE.test(m[2].trim()) ? "" : `## ${m[2].trim()}\n${p.slice(m[0].length).trim()}`) : `## Overview\n${p.trim()}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  const sections = chunkText(text).filter((s) => s.text.length > 40);
  if (sections.length < 2) throw new Error(`"${page.title}" on Wikipedia doesn't describe how to play.`);
  const url = page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  return {
    id: `${slug(page.title)}-wiki`,
    name: page.title.replace(/ \((card |board )?game\)$/i, ""),
    sections,
    houseRules: [],
    origin: "wikipedia",
    addedAt: Date.now(),
    source: { title: page.title, url, license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  };
}
