// Zeb the Ref - Game Ref's mascot. Hand-drawn SVG, one function, a pose per mood.
export type Mood = "idle" | "thinking" | "yes" | "no" | "depends" | "appeal" | "overturned" | "upheld";

let uid = 0;

const INK = "#111";

function arm(d: string, hoof: [number, number]): string {
  return `<path d="${d}" stroke="${INK}" stroke-width="19" fill="none" stroke-linecap="round"/>
    <path d="${d}" stroke="#fff" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="${d}" stroke="${INK}" stroke-width="13" fill="none" stroke-dasharray="4 9" stroke-linecap="butt" opacity=".85"/>
    <circle cx="${hoof[0]}" cy="${hoof[1]}" r="9" fill="#3b3b3b" stroke="${INK}" stroke-width="3"/>`;
}

const ARMS = {
  leftDown: arm("M64 146 Q48 170 50 196", [50, 201]),
  rightDown: arm("M136 146 Q152 170 150 196", [150, 201]),
  rightUp: arm("M136 146 Q160 124 164 96", [164, 90]),
  leftShrug: arm("M64 148 Q40 152 34 130", [32, 124]),
  rightShrug: arm("M136 148 Q160 152 166 130", [168, 124]),
  leftHold: arm("M64 146 Q58 176 70 190", [70, 192]),
  rightHold: arm("M136 146 Q142 176 130 190", [130, 192]),
};

function card(color: string, symbol: string, symColor = "#fff"): string {
  return `<g class="zeb-card"><rect x="150" y="38" width="30" height="42" rx="4" fill="${color}" stroke="${INK}" stroke-width="3" transform="rotate(12 165 59)"/>
    <text x="166" y="68" font-size="24" font-weight="900" text-anchor="middle" fill="${symColor}" font-family="system-ui,sans-serif" transform="rotate(12 165 59)">${symbol}</text></g>`;
}

const PROPS: Partial<Record<Mood, string>> = {
  yes: card("#2ecc71", "✓"),
  no: card("#ff3b3b", "!"),
  thinking: `<g class="zeb-book"><rect x="68" y="172" width="64" height="38" rx="4" fill="#f5c518" stroke="${INK}" stroke-width="3"/>
    <rect x="68" y="172" width="8" height="38" fill="#d9a800" stroke="${INK}" stroke-width="3"/>
    <text x="101" y="196" font-size="11" font-weight="900" text-anchor="middle" fill="${INK}" font-family="system-ui,sans-serif">RULES</text></g>`,
  appeal: `<g class="zeb-screen"><rect x="66" y="170" width="68" height="42" rx="5" fill="#1d2330" stroke="${INK}" stroke-width="3"/>
    <text x="100" y="182" font-size="8" font-weight="900" text-anchor="middle" fill="#5aa9ff" font-family="system-ui,sans-serif" letter-spacing="1">REPLAY</text>
    <path d="M93 187 L108 195 L93 203 Z" fill="#5aa9ff"/></g>`,
  overturned: card("#b48cff", "↺"),
  upheld: card("#2ecc71", "✓"),
};

const EXTRAS: Partial<Record<Mood, string>> = {
  depends: `<text class="zeb-q" x="168" y="58" font-size="34" font-weight="900" fill="#ffb020" font-family="system-ui,sans-serif">?</text>`,
  no: `<text class="zeb-tweet" x="4" y="120" font-size="15" font-weight="900" fill="#ff5a5f" font-family="system-ui,sans-serif" transform="rotate(-14 30 116)">TWEET!</text>`,
  yes: `<path class="zeb-spark" d="M30 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="#f5c518"/>`,
  thinking: `<g class="zeb-dots" fill="#9aa0ab"><circle cx="160" cy="34" r="4"/><circle cx="172" cy="24" r="5"/><circle cx="186" cy="12" r="6"/></g>`,
};

function face(mood: Mood): string {
  // pupils offset, brows, mouth
  const look: Record<string, [number, number]> = { thinking: [-2, -4], appeal: [0, 3], depends: [3, -2] };
  const [dx, dy] = look[mood] ?? [0, 0];
  const happyBrows = `<path d="M76 70 Q85 64 94 70 M106 70 Q115 64 124 70" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const brows: Record<string, string> = {
    no: `<path d="M76 66 L94 73 M124 66 L106 73" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    depends: `<path d="M76 70 Q85 66 94 70 M106 66 Q115 58 124 63" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    thinking: `<path d="M76 68 Q85 63 94 67 M106 67 Q115 63 124 68" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  };
  const mouths: Record<string, string> = {
    yes: `<path d="M86 120 Q100 138 114 120 Q100 126 86 120 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
    upheld: `<path d="M86 120 Q100 138 114 120 Q100 126 86 120 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
    no: `<path d="M89 128 Q100 118 111 128" stroke="#e8e8e8" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    depends: `<path d="M88 124 q4 -4 8 0 t8 0 t8 0" stroke="#e8e8e8" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    thinking: `<ellipse cx="102" cy="125" rx="4" ry="5" fill="#111" stroke="#e8e8e8" stroke-width="2"/>`,
    appeal: `<path d="M91 124 L109 124" stroke="#e8e8e8" stroke-width="3" stroke-linecap="round"/>`,
    overturned: `<ellipse cx="100" cy="125" rx="7" ry="6" fill="#111" stroke="#e8e8e8" stroke-width="2"/>`,
  };
  const smile = `<path d="M88 121 Q100 132 112 121" stroke="#e8e8e8" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `${brows[mood] ?? happyBrows}
    <ellipse cx="85" cy="86" rx="9" ry="11" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <ellipse cx="115" cy="86" rx="9" ry="11" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
    <g class="zeb-pupils"><circle cx="${86 + dx}" cy="${88 + dy}" r="4.8" fill="${INK}"/><circle cx="${116 + dx}" cy="${88 + dy}" r="4.8" fill="${INK}"/>
    <circle cx="${87.5 + dx}" cy="${86 + dy}" r="1.6" fill="#fff"/><circle cx="${117.5 + dx}" cy="${86 + dy}" r="1.6" fill="#fff"/></g>
    ${mouths[mood] ?? smile}`;
}

function arms(mood: Mood): string {
  switch (mood) {
    case "yes":
    case "no":
    case "overturned":
    case "upheld":
      return ARMS.leftDown + `<g class="zeb-arm-up">${ARMS.rightUp}${PROPS[mood]}</g>`;
    case "depends":
      return ARMS.leftShrug + ARMS.rightShrug;
    case "thinking":
    case "appeal":
      return PROPS[mood]! + ARMS.leftHold + ARMS.rightHold;
    default:
      return ARMS.leftDown + ARMS.rightDown;
  }
}

/** Zeb the Ref as an SVG string. `headOnly` crops to the head (for the favicon / header). */
export function zeb(mood: Mood = "idle", opts: { headOnly?: boolean; label?: string } = {}): string {
  const id = `zeb${++uid}`;
  const head = `
    <ellipse cx="62" cy="42" rx="10" ry="20" transform="rotate(-32 62 42)" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="62" cy="44" rx="4" ry="11" transform="rotate(-32 62 44)" fill="#444"/>
    <ellipse cx="138" cy="42" rx="10" ry="20" transform="rotate(32 138 42)" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="138" cy="44" rx="4" ry="11" transform="rotate(32 138 44)" fill="#444"/>
    <clipPath id="${id}-h"><ellipse cx="100" cy="86" rx="38" ry="44"/></clipPath>
    <ellipse cx="100" cy="86" rx="38" ry="44" fill="#fff"/>
    <g clip-path="url(#${id}-h)" fill="${INK}">
      <path d="M60 76 Q72 70 75 77 Q70 80 60 84 Z"/><path d="M60 96 Q71 90 74 97 Q69 100 60 104 Z"/>
      <path d="M140 76 Q128 70 125 77 Q130 80 140 84 Z"/><path d="M140 96 Q129 90 126 97 Q131 100 140 104 Z"/>
      <path d="M60 60 Q74 58 80 63 Q72 66 60 70 Z"/><path d="M140 60 Q126 58 120 63 Q128 66 140 70 Z"/>
    </g>
    <ellipse cx="100" cy="86" rx="38" ry="44" fill="none" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="100" cy="118" rx="26" ry="18" fill="#454545" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="91" cy="111" rx="3.5" ry="2.6" fill="${INK}"/><ellipse cx="109" cy="111" rx="3.5" ry="2.6" fill="${INK}"/>
    ${face(mood)}
    <path d="M62 54 Q64 16 100 14 Q136 16 138 54 Z" fill="${INK}"/>
    <path d="M60 52 Q100 62 148 50 Q151 58 144 61 Q100 70 60 60 Z" fill="#262626" stroke="${INK}" stroke-width="2"/>
    <circle cx="100" cy="15" r="3.5" fill="#262626"/>
    <text x="100" y="44" font-size="13" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" letter-spacing="1">REF</text>
    <path d="M90 22 l3 -9 l4 8 l4 -9 l4 8 l3 -7" stroke="${INK}" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
  if (opts.headOnly) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="44 2 112 138" role="img" aria-label="${opts.label ?? "Zeb the Ref"}">${head}</svg>`;
  }
  const body = `
    <clipPath id="${id}-t"><path d="M58 150 Q60 132 82 128 L118 128 Q140 132 142 150 L146 226 L54 226 Z"/></clipPath>
    <rect x="86" y="118" width="28" height="18" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <g clip-path="url(#${id}-t)">
      <rect x="50" y="120" width="100" height="110" fill="#fff"/>
      <g fill="${INK}">${[58, 74, 90, 106, 122, 138].map((x) => `<rect x="${x}" y="120" width="8" height="110"/>`).join("")}</g>
    </g>
    <path d="M58 150 Q60 132 82 128 L118 128 Q140 132 142 150 L146 226 L54 226 Z" fill="none" stroke="${INK}" stroke-width="3"/>
    <path d="M84 128 L100 146 L116 128 Z" fill="${INK}"/>
    <path d="M88 132 L100 158 L112 132" stroke="#e63946" stroke-width="3" fill="none"/>
    <g class="zeb-whistle"><rect x="92" y="156" width="18" height="11" rx="5.5" fill="#c9ccd1" stroke="${INK}" stroke-width="2.5"/>
      <rect x="108" y="158.5" width="9" height="6" rx="1.5" fill="#c9ccd1" stroke="${INK}" stroke-width="2"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" class="zeb ${mood}" role="img" aria-label="${opts.label ?? `Zeb the Ref (${mood})`}">
    ${EXTRAS[mood] ?? ""}${body}${arms(mood)}<g class="zeb-head">${head}</g></svg>`;
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
