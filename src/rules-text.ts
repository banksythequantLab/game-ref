// Pure text helpers shared by the app and tools/bundle-games.ts (no runtime imports, so Node can run it).
import type { Game, Section } from "./store";

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "game";
}

const HEADING = /^(\d+(\.\d+)*[.)]?\s+\S.{0,80}|#{1,4}\s+\S.{0,80}|[A-Z][A-Z0-9 '&:,-]{3,60})$/;

/** Split plain text into sections using headings, falling back to ~900-char paragraph chunks. */
export function chunkText(text: string): Section[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const raw: { title: string; body: string[] }[] = [];
  let cur = { title: "Introduction", body: [] as string[] };
  for (const line of lines) {
    const l = line.trim();
    if (l && l.length < 90 && HEADING.test(l) && !/[.,;]$/.test(l)) {
      if (cur.body.join(" ").trim()) raw.push(cur);
      cur = { title: l.replace(/^#+\s*/, ""), body: [] };
    } else {
      cur.body.push(l);
    }
  }
  if (cur.body.join(" ").trim()) raw.push(cur);

  const out: Section[] = [];
  for (const r of raw) {
    const paras = r.body.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    let buf = "";
    let part = 0;
    const flush = () => {
      if (!buf) return;
      part++;
      out.push({ id: String(out.length + 1), title: part > 1 ? `${r.title} (cont.)` : r.title, text: buf.trim() });
      buf = "";
    };
    for (const p of paras) {
      if (buf.length + p.length > 900) flush();
      buf += (buf ? "\n" : "") + p;
    }
    flush();
  }
  return out;
}

// Wikipedia sections worth keeping for a referee, and ones to drop.
const KEEP = /rule|play|game ?play|scor|set ?up|setup|deal|turn|move|win|end|object|equipment|component|card|piece|special|variant|variation|house|penalt|foul|official|tournament|strategy|terminology|glossary|how/i;
const DROP = /^(history|origin|etymology|reception|legacy|in popular culture|popular culture|culture|media|see also|references|notes|footnotes|further reading|external links|bibliography|sources|awards|sales|development|publication|release|editions?|merchandise|video games?|adaptations?|competitions? results|world champions?)$/i;
// Spin-offs, media and merchandise that share a word with "rules" but aren't rules.
const NOISE = /adaptation|game show|slot machine|film|television|\btv\b|fandom|series|merchandis|deck styles|card and deck|h2o|app|video game|online|tournaments? held|records?|celebrit|controvers|lawsuit|sponsor|championship|editions?|parody|unauthori[sz]ed|by locale|play-by-mail|as a phrase|playmaster/i;

export interface WikiPage {
  title: string;
  extract: string;
  fullurl?: string;
}

/** Turn a Wikipedia article's plain text into a Game made of its rules sections (CC BY-SA credited). */
export function gameFromWikiPage(page: WikiPage, displayName?: string): Game {
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
        if (!m) return `## Overview\n${p.trim()}`;
        const h = m[2].trim();
        return DROP.test(h) || NOISE.test(h) ? "" : `## ${h}\n${p.slice(m[0].length).trim()}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  const sections = chunkText(text).filter((s) => s.text.length > 40);
  if (sections.length < 2) throw new Error(`"${page.title}" on Wikipedia doesn't describe how to play.`);
  const url = page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  return {
    id: `${slug(page.title)}-wiki`,
    name: displayName ?? page.title.replace(/ \((card |board |dice )?game\)$/i, ""),
    sections,
    houseRules: [],
    origin: "wikipedia",
    addedAt: Date.now(),
    source: { title: page.title, url, license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  };
}
