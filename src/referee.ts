// The referee: on-device first rulings, cloud appeals, and cloud variation scouting.
import type { Part, GenerativeModel } from "firebase/ai";
import { refereeModel, cloudRefereeModel, appealsModel, variationsModel, plainCloudModel, settings, retrying, isBusyError } from "./firebase";
import { retrieve, type Game, type Section, type HouseRule } from "./store";

export type Verdict = "YES" | "NO" | "DEPENDS";
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
"verdict" is the direct answer to the question: YES (it is allowed / it is true) or NO (it is not allowed / it is not true).
If the rules do not settle it, answer DEPENDS and say exactly what would decide it.
"ruling" is one short sentence a player can read aloud. "explanation" is 1-3 sentences.
List the bracketed rule ids you relied on in citedRuleIds (use "HOUSE" for a house rule).
"confidence" is a number from 0 to 1.${hasPhoto ? "\nThe attached photo shows the current game state. FIRST fill \"observed\": list the pieces, cards or positions in the photo that matter for this question, and what each one attacks, blocks or affects. Then check EVERY condition of the relevant rule against what you observed before deciding." : "\nCheck every condition of the relevant rule before deciding."}

RULES:
${sectionsBlock(sections)}

ACTIVE HOUSE RULES:
${houseBlock(game.houseRules)}

QUESTION: ${question}`;
}

function parse(text: string): Omit<Ruling, "source" | "stage" | "ms" | "question" | "consulted" | "at"> {
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const j = JSON.parse(raw);
  const alias: Record<string, Verdict> = { ALLOWED: "YES", NOT_ALLOWED: "NO" };
  const verdict: Verdict = ["YES", "NO", "DEPENDS"].includes(j.verdict) ? j.verdict : (alias[j.verdict] ?? "DEPENDS");
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

/** Cloud ruling that survives "high demand": retry the default model, then switch to the backup model. */
async function cloudCall(request: Parameters<GenerativeModel["generateContent"]>[0]) {
  try {
    return await retrying(() => cloudRefereeModel().generateContent(request), 2);
  } catch (e) {
    const backup = settings.appeal_model;
    if (!isBusyError(e) || !backup || backup === settings.cloud_model) throw e;
    return await retrying(() => cloudRefereeModel(backup).generateContent(request), 3);
  }
}

const ON_DEVICE_TIMEOUT_MS = 30_000;
let deviceBusy = false;

/** First ruling. Runs on Gemini Nano when Chrome has it, otherwise in the cloud (SDK decides).
 *  If the on-device model stalls (cold start, busy GPU) and we're online, the cloud takes the call. */
export async function callIt(game: Game, question: string, photo?: Part, onSlow?: () => void): Promise<Ruling> {
  const consulted = retrieve(game, question);
  const request = withPhoto(refereePrompt(game, consulted, question, !!photo), photo);
  const t0 = performance.now();
  // If an earlier on-device call is still grinding, don't queue another one behind it.
  if (deviceBusy && navigator.onLine) {
    onSlow?.();
    const res = await cloudCall(request);
    return {
      ...parse(res.response.text()),
      source: "in_cloud",
      stage: "first",
      ms: Math.round(performance.now() - t0),
      question,
      consulted,
      at: Date.now(),
    };
  }
  deviceBusy = true;
  const primary = refereeModel().generateContent(request);
  primary.finally(() => (deviceBusy = false)).catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<"stalled">((resolve) => {
    timer = setTimeout(() => resolve("stalled"), ON_DEVICE_TIMEOUT_MS);
  });
  let res = await Promise.race([
    primary.catch((e) => {
      // No on-device model (e.g. phones): the SDK went to the cloud and that call hit a busy error.
      if (navigator.onLine && isBusyError(e)) return "busy" as const;
      throw e;
    }),
    stalled,
  ]);
  clearTimeout(timer);
  let fellBack = false;
  if (res === "busy") {
    res = await cloudCall(request);
    fellBack = true;
  } else if (res === "stalled") {
    if (!navigator.onLine) res = await primary; // offline: keep waiting for the device
    else {
      onSlow?.();
      primary.catch(() => {}); // let the slow on-device call finish quietly
      res = await cloudCall(request);
      fellBack = true;
    }
  }
  const ms = Math.round(performance.now() - t0);
  return {
    ...parse(res.response.text()),
    source: fellBack || res.response.inferenceSource === "in_cloud" ? "in_cloud" : "on_device",
    stage: "first",
    ms,
    question,
    consulted,
    at: Date.now(),
  };
}

/** Should the first ruling be sent up to the cloud appeals court automatically? */
export function needsAppeal(r: Ruling, hadPhoto = false): boolean {
  // Board-state questions are where small models slip, so photo rulings always get a second look.
  return r.stage === "first" && (hadPhoto || r.confidence < settings.escalate_below || r.citedRuleIds.length === 0);
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
  const req = withPhoto(prompt, photo);
  const res = await retrying(() => appealsModel().generateContent(req), 2).catch(() => retrying(() => appealsModel(true).generateContent(req)));
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
  grounded: boolean;
  searchWidgetHtml?: string;
  sources: { title: string; uri: string }[];
}

/** Find official variants, FAQ/errata and popular house rules - cloud + Google Search grounding. */
export async function findVariations(game: Game): Promise<VariationResult> {
  const prompt = `Search for the official variants, official FAQ or errata rulings, and the most popular house rules for the game "${game.name}".
Return 5 to 12 items. Output ONLY lines in exactly this format, nothing else:
VARIANT | <short name> | <one or two sentences describing exactly how play changes>`;
  let res;
  let grounded = true;
  try {
    res = await variationsModel().generateContent(prompt);
  } catch (e) {
    // Search grounding needs paid quota; fall back to Gemini's own knowledge and say so.
    console.warn("Grounded search unavailable, using model knowledge", e);
    grounded = false;
    res = await retrying(() =>
      plainCloudModel().generateContent(prompt.replace("Search for", "From your knowledge, list"))
    );
  }
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
    grounded,
    searchWidgetHtml: gm?.searchEntryPoint?.renderedContent,
    sources: (gm?.groundingChunks ?? [])
      .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri),
  };
}
