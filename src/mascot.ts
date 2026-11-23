// Zeb the Ref - Game Ref's mascot: one pose per mood, plus his lines and his whistle.
export type Mood = "idle" | "thinking" | "yes" | "no" | "depends" | "appeal" | "overturned" | "upheld";

// The art is rendered with ComfyUI (Qwen-Image-Edit 2511) and cut out to transparent WebP in public/zeb/.
const ALT: Record<Mood, string> = {
  idle: "Zeb the Ref, a cartoon zebra referee, standing ready",
  thinking: "Zeb reading the rulebook",
  yes: "Zeb holding up a green check card",
  no: "Zeb blowing his whistle and holding up a red card",
  depends: "Zeb shrugging with a question mark",
  appeal: "Zeb watching a video replay",
  overturned: "Zeb holding up a purple card, surprised",
  upheld: "Zeb giving a thumbs-up",
};

/** Zeb the Ref as an <img>. `headOnly` = the head crop (header logo / favicon). */
export function zeb(mood: Mood = "idle", opts: { headOnly?: boolean; label?: string } = {}): string {
  if (opts.headOnly) return `<img class="zeb-head-img" src="/zeb/head.webp" alt="${opts.label ?? "Zeb the Ref"}" />`;
  return `<img class="zeb ${mood}" src="/zeb/${mood}.webp" alt="${opts.label ?? ALT[mood]}" draggable="false" />`;
}

/** Warm the browser cache so pose swaps are instant. */
export function preloadZeb(): void {
  for (const m of Object.keys(ALT)) {
    const i = new Image();
    i.src = `/zeb/${m}.webp`;
  }
}

/** What Zeb says. Picked at random so repeated calls don't feel canned. */
const LINES: Record<Mood, string[]> = {
  idle: ["I'm Zeb. Ask me anything about the rules.", "Rules question? I've got the book.", "Keep it clean out there."],
  thinking: ["Checking the rulebook...", "Hold on, flipping pages...", "Let me look that up..."],
  yes: ["Play on!", "Legal move!", "That's allowed. Carry on.", "Clean play!"],
  no: ["Foul! Not allowed.", "Not on my watch!", "Rule says no.", "Whoa there - that's illegal!"],
  depends: ["Hmm... it depends.", "Tricky one! Here's what decides it.", "Could go either way..."],
  appeal: ["Going to the replay booth...", "Let's take a second look.", "Checking the whole rulebook..."],
  overturned: ["After review, the call is reversed!", "Good challenge - call overturned!"],
  upheld: ["After review, the call stands!", "Replay confirms the call!"],
};
export function line(mood: Mood): string {
  const l = LINES[mood];
  return l[Math.floor(Math.random() * l.length)];
}

// ---------------- the whistle (Web Audio, no files) ----------------
let actx: AudioContext | null = null;
export function whistle(blasts = 1): void {
  try {
    if (localStorage.getItem("gameref:muted") === "1") return;
  } catch {
    /* storage blocked: play anyway */
  }
  try {
    actx ??= new AudioContext();
    const t0 = actx.currentTime;
    for (let i = 0; i < blasts; i++) {
      const start = t0 + i * 0.32;
      const len = blasts > 1 ? 0.22 : 0.16;
      const osc = actx.createOscillator();
      const trill = actx.createOscillator();
      const trillGain = actx.createGain();
      const amp = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = 2900;
      trill.frequency.value = 32; // the pea rattling in the whistle
      trillGain.gain.value = 260;
      trill.connect(trillGain).connect(osc.frequency);
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(0.18, start + 0.02);
      amp.gain.setValueAtTime(0.18, start + len - 0.04);
      amp.gain.linearRampToValueAtTime(0, start + len);
      osc.connect(amp).connect(actx.destination);
      osc.start(start);
      trill.start(start);
      osc.stop(start + len);
      trill.stop(start + len);
    }
  } catch {
    /* no audio available */
  }
}
