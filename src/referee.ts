// The referee: on-device first rulings, cloud appeals, and cloud variation scouting.
import type { Part } from "firebase/ai";
import { refereeModel, appealsModel, variationsModel, settings } from "./firebase";
import { retrieve, type Game, type Section, type HouseRule } from "./store";

export type Verdict = "ALLOWED" | "NOT_ALLOWED" | "DEPENDS";
export interface Ruling {
  verdict: Verdict;
  ruling: string;
  explanation: string;
  citedRuleIds: string[];
  confidence: number;
  source: "on_device" | "in_cloud";
  stage: "first" | "appeal";
  ms: number;
  question: string;
  consulted: Section[];
  at: number;
}

function sectionsBlock(sections: Section[]): string {
  return sections.map((s) => `[${s.id}] ${s.title}\n${s.text}`).join("\n\n");
}
function houseBlock(rules: HouseRule[]): string {
  const on = rules.filter((r) => r.active);
  return on.length ? on.map((r) => `- ${r.name}: ${r.text}`).join("\n") : "(none - play by the book)";
}

function refereePrompt(game: Game, sections: Section[], question: string, hasPhoto: boolean): string {
  return `You are Game Ref, the impartial referee for the game "${game.name}".
Decide the player's question using ONLY the RULES and ACTIVE HOUSE RULES below.
House rules override the rulebook wherever they conflict.
If the rules do not settle it, answer DEPENDS and say exactly what would decide it.
"ruling" is one short sentence a player can read aloud. "explanation" is 1-3 sentences.
List the bracketed rule ids you relied on in citedRuleIds (use "HOUSE" for a house rule).
"confidence" is a number from 0 to 1.${hasPhoto ? "\nThe attached photo shows the current game state; use it." : ""}

RULES:
${sectionsBlock(sections)}

ACTIVE HOUSE RULES:
${houseBlock(game.houseRules)}

QUESTION: ${question}`;
}

function parse(text: string): Omit<Ruling, "source" | "stage" | "ms" | "question" | "consulted" | "at"> {
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const j = JSON.parse(raw);
  const verdict: Verdict = ["ALLOWED", "NOT_ALLOWED", "DEPENDS"].includes(j.verdict) ? j.verdict : "DEPENDS";
  let confidence = Number(j.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  if (confidence > 1) confidence = confidence / 100;
  return {
    verdict,
    ruling: String(j.ruling ?? ""),
    explanation: String(j.explanation ?? ""),
    citedRuleIds: Array.isArray(j.citedRuleIds) ? j.citedRuleIds.map(String) : [],
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function withPhoto(prompt: string, photo?: Part): string | (string | Part)[] {
  return photo ? [prompt, photo] : prompt;
}

/** First ruling. Runs on Gemini Nano when Chrome has it, otherwise in the cloud (SDK decides). */
export async function callIt(game: Game, question: string, photo?: Part): Promise<Ruling> {
  const consulted = retrieve(game, question);
  const t0 = performance.now();
  const res = await refereeModel().generateContent(
    withPhoto(refereePrompt(game, consulted, question, !!photo), photo)
  );
  const ms = Math.round(performance.now() - t0);
  return {
    ...parse(res.response.text()),
    source: res.response.inferenceSource === "in_cloud" ? "in_cloud" : "on_device",
    stage: "first",
    ms,
    question,
    consulted,
    at: Date.now(),
  };
}

/** Should the first ruling be sent up to the cloud appeals court automatically? */
export function needsAppeal(r: Ruling): boolean {
  return r.stage === "first" && (r.confidence < settings.escalate_below || r.citedRuleIds.length === 0);
}

/** Appeal: cloud model reads the WHOLE rulebook and reviews the first ruling. */
export async function appeal(game: Game, first: Ruling, photo?: Part): Promise<Ruling> {
  const all = game.sections.slice();
  let book = sectionsBlock(all);
  if (book.length > 400_000) book = book.slice(0, 400_000);
  const prompt = `${refereePrompt(game, [], first.question, !!photo).replace("RULES:\n", `RULES (complete rulebook):\n${book}`)}

A first ruling was made from a partial reading of the rules:
verdict=${first.verdict}; ruling="${first.ruling}"; cited=${first.citedRuleIds.join(", ") || "none"}.
You are the appeals referee. Review the complete rulebook, then uphold or overturn it.`;
  const t0 = performance.now();
  const res = await appealsModel().generateContent(withPhoto(prompt, photo));
  const ms = Math.round(performance.now() - t0);
  const parsed = parse(res.response.text());
  const ids = new Set(parsed.citedRuleIds);
  return {
    ...parsed,
    source: "in_cloud",
    stage: "appeal",
    ms,
    question: first.question,
    consulted: all.filter((s) => ids.has(s.id)),
    at: Date.now(),
  };
}

export interface Variation {
  name: string;
  text: string;
}
export interface VariationResult {
  variations: Variation[];
  searchWidgetHtml?: string;
  sources: { title: string; uri: string }[];
}

/** Find official variants, FAQ/errata and popular house rules - cloud + Google Search grounding. */
export async function findVariations(game: Game): Promise<VariationResult> {
  const prompt = `Search for the official variants, official FAQ or errata rulings, and the most popular house rules for the game "${game.name}".
Return 5 to 12 items. Output ONLY lines in exactly this format, nothing else:
VARIANT | <short name> | <one or two sentences describing exactly how play changes>`;
  const res = await variationsModel().generateContent(prompt);
  const variations = res.response
    .text()
    .split("\n")
    .map((l) => l.replace(/^[\s*\-•]+/, "").trim())
    .filter((l) => /^VARIANT\s*\|/i.test(l))
    .map((l) => l.split("|").map((p) => p.trim()))
    .filter((p) => p.length >= 3 && p[1] && p[2])
    .map((p) => ({ name: p[1], text: p.slice(2).join(" | ") }));
  const gm = res.response.candidates?.[0]?.groundingMetadata;
  return {
    variations,
    searchWidgetHtml: gm?.searchEntryPoint?.renderedContent,
    sources: (gm?.groundingChunks ?? [])
      .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri),
  };
}
