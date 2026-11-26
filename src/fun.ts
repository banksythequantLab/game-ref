// Game-night extras: Zeb's video clips, Zeb's voice, the "Rules Lawyer of the Night" scoreboard,
// and "Hey Zeb" voice questions. Everything here runs in the browser; nothing is sent anywhere.

// ---------------- sound setting (whistle + voice) ----------------
export function soundOn(): boolean {
  try {
    return localStorage.getItem("gameref:muted") !== "1";
  } catch {
    return true;
  }
}

// ---------------- Zeb's clips (the "jumbotron") ----------------
export type Clip = "wave" | "whistle" | "cheer" | "cards" | "replay";
let clipTimer: ReturnType<typeof setTimeout> | undefined;

export function clipsOn(): boolean {
  try {
    return localStorage.getItem("gameref:clips") !== "0";
  } catch {
    return true;
  }
}

/** Play one of Zeb's 5-second clips above the ruling. loop = keep playing until stopClip(). */
export function playClip(name: Clip, label: string, loop = false): void {
  if (!clipsOn()) return;
  const box = document.getElementById("jumbotron")!;
  const v = box.querySelector("video")!;
  box.querySelector(".jt-label")!.textContent = label;
  clearTimeout(clipTimer);
  v.loop = loop;
  v.muted = true;
  v.src = `/clips/${name}.mp4`;
  box.classList.remove("hidden", "out");
  v.currentTime = 0;
  v.play().catch(() => {});
  v.onended = () => stopClip();
}

export function stopClip(delay = 0): void {
  const box = document.getElementById("jumbotron");
  if (!box) return;
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => {
    box.classList.add("out");
    clipTimer = setTimeout(() => {
      box.classList.add("hidden");
      box.querySelector("video")!.pause();
    }, 350);
  }, delay);
}

// ---------------- Zeb's voice (browser speech synthesis, works offline) ----------------
let zebVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return (
    vs.find((v) => /Google US English/i.test(v.name)) ??
    vs.find((v) => /Guy|David|Mark|Daniel|Male/i.test(v.name)) ??
    vs.find((v) => v.localService) ??
    vs[0] ??
    null
  );
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => (zebVoice = pickVoice());
  zebVoice = pickVoice();
}

/** Zeb reads a line out loud. New lines interrupt old ones. */
export function speak(text: string): void {
  if (!soundOn() || !text) return;
  // Android app: the WebView has no speechSynthesis, so Zeb uses Android's TextToSpeech.
  const nativeTts = (window as unknown as { ZebNative?: { speak(t: string): void } }).ZebNative;
  if (nativeTts) {
    nativeTts.speak(text.replace(/[*_#]/g, ""));
    return;
  }
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ""));
  if (zebVoice) u.voice = zebVoice;
  u.rate = 1.05;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}

// ---------------- "Hey Zeb" (Web Speech recognition, on-device when Chrome has the language pack) ----------------
type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type RecCtor = (new () => Rec) & {
  available?: (o: object) => Promise<string>;
  install?: (o: object) => Promise<boolean>;
};
const Ctor = ((window as unknown as { SpeechRecognition?: RecCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition) as RecCtor | undefined;

// Android WebView exposes the constructor but has no recognition service behind it.
export const canListen = () => !!Ctor && !("ZebNative" in window);
let local: boolean | null = null;

/** Try to use on-device speech recognition; returns true when audio never leaves the device. */
export async function prepareLocalSpeech(): Promise<boolean> {
  if (local !== null) return local;
  local = false;
  try {
    if (Ctor?.available) {
      const opts = { langs: ["en-US"], processLocally: true };
      let st = await Ctor.available(opts);
      if (st === "downloadable" && Ctor.install) st = (await Ctor.install(opts)) ? "available" : st;
      local = st === "available";
    }
  } catch {
    local = false;
  }
  return local;
}

function makeRec(continuous: boolean): Rec {
  const r = new Ctor!();
  r.lang = "en-US";
  r.continuous = continuous;
  r.interimResults = false;
  if (local) r.processLocally = true;
  return r;
}

/** One question by voice: resolves with what was said. */
export async function listenOnce(): Promise<string> {
  await prepareLocalSpeech();
  return new Promise((resolve, reject) => {
    const r = makeRec(false);
    let said = "";
    r.onresult = (e) => (said = Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onerror = (e) => reject(new Error(e.error === "not-allowed" ? "Microphone permission was denied." : `Didn't catch that (${e.error}).`));
    r.onend = () => resolve(said.trim());
    r.start();
  });
}

const WAKE = /\b(hey|hi|okay|ok)[ ,]+(zeb|zebra|seb|zed|zep|jeb|deb)\b[ ,.!?]*/i;
let wakeRec: Rec | null = null;
let wakeWanted = false;

/** Hands-free: keep listening; anything said after "Hey Zeb" becomes a question. */
export async function startWakeWord(onQuestion: (q: string) => void, onWake?: () => void): Promise<boolean> {
  if (!Ctor) return false;
  await prepareLocalSpeech();
  wakeWanted = true;
  let armed = false; // "Hey Zeb" heard on its own: the next phrase is the question
  const loop = () => {
    if (!wakeWanted) return;
    wakeRec = makeRec(true);
    wakeRec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const t = e.results[i][0].transcript.trim();
        const m = t.match(WAKE);
        if (m) {
          const rest = t.slice((m.index ?? 0) + m[0].length).trim();
          if (rest.split(/\s+/).length >= 3) onQuestion(rest);
          else {
            armed = true;
            onWake?.();
          }
        } else if (armed && t.split(/\s+/).length >= 3) {
          armed = false;
          onQuestion(t);
        }
      }
    };
    wakeRec.onerror = (e) => {
      if (e.error === "not-allowed") wakeWanted = false;
    };
    wakeRec.onend = () => setTimeout(loop, 250); // Chrome ends sessions on silence; restart
    wakeRec.start();
  };
  loop();
  return true;
}
export function stopWakeWord(): void {
  wakeWanted = false;
  try {
    wakeRec?.stop();
  } catch {
    /* already stopped */
  }
  wakeRec = null;
}
export const usingLocalSpeech = () => local === true;
