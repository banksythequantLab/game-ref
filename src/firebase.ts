// Firebase setup: App Check, Remote Config, and the Firebase AI Logic models.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
} from "firebase/ai";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// App Check is required by Firebase AI Logic. Debug mode prints a token for localhost testing.
if (env.VITE_APPCHECK_DEBUG === "true") {
  // A pre-registered token from .env (gitignored), or `true` to have the SDK print a new one.
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APPCHECK_DEBUG_TOKEN || true;
}
if (env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Remote Config: swap cloud models / tune escalation without shipping a new build.
const DEFAULTS = {
  cloud_model: "gemini-3.5-flash-lite",
  appeal_model: "gemini-3.5-flash-lite",
  escalate_below: 0.55,
};
export const settings = { ...DEFAULTS };

export async function loadSettings(): Promise<void> {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 10 * 60 * 1000;
    rc.defaultConfig = DEFAULTS;
    if (navigator.onLine) await fetchAndActivate(rc);
    settings.cloud_model = getValue(rc, "cloud_model").asString() || DEFAULTS.cloud_model;
    settings.appeal_model = getValue(rc, "appeal_model").asString() || DEFAULTS.appeal_model;
    settings.escalate_below = getValue(rc, "escalate_below").asNumber() || DEFAULTS.escalate_below;
  } catch (e) {
    console.warn("Remote Config unavailable, using defaults", e);
  }
}

export const ai = getAI(app, { backend: new GoogleAIBackend() });

// The shape of every ruling, enforced on-device (responseConstraint) and in the cloud (responseSchema).
export const rulingSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["ALLOWED", "NOT_ALLOWED", "DEPENDS"] }),
    ruling: Schema.string(),
    explanation: Schema.string(),
    citedRuleIds: Schema.array({ items: Schema.string() }),
    confidence: Schema.number(),
  },
});

export const sectionsSchema = Schema.object({
  properties: {
    game: Schema.string(),
    sections: Schema.array({
      items: Schema.object({
        properties: { id: Schema.string(), title: Schema.string(), text: Schema.string() },
      }),
    }),
  },
});

const ON_DEVICE_IO = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }, { type: "image" as const }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

let _referee: GenerativeModel | null = null;
let _appeals: GenerativeModel | null = null;
let _ingest: GenerativeModel | null = null;
let _variations: GenerativeModel | null = null;

/** The everyday referee: Gemini Nano in Chrome when available, cloud fallback otherwise. */
export function refereeModel(): GenerativeModel {
  return (_referee ??= getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: ON_DEVICE_IO,
      promptOptions: { responseConstraint: rulingSchema },
    },
    inCloudParams: {
      model: settings.cloud_model,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: rulingSchema,
      },
    },
  }));
}

/** Retry cloud calls that fail with temporary capacity errors (429 / 500 / 503). */
export async function retrying<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (i >= tries - 1 || !/\[(429|500|503) ?\]|high demand|overloaded|unavailable/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

let _cloudReferee: GenerativeModel | null = null;
/** Same referee, cloud only - used when the on-device model stalls. */
export function cloudRefereeModel(): GenerativeModel {
  return (_cloudReferee ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: settings.cloud_model,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: rulingSchema,
      },
    },
  }));
}

/** Appeals court: always cloud, reads the entire rulebook plus the first ruling. */
export function appealsModel(): GenerativeModel {
  return (_appeals ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: settings.appeal_model,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: rulingSchema,
      },
    },
  }));
}

/** Cloud rulebook reader: turns a rulebook PDF into numbered rule sections. */
export function ingestModel(): GenerativeModel {
  return (_ingest ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: settings.appeal_model,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
        responseSchema: sectionsSchema,
      },
    },
  }));
}

/** Variations scout: cloud + Grounding with Google Search for official variants, FAQs and house rules. */
export function variationsModel(): GenerativeModel {
  return (_variations ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: settings.cloud_model, tools: [{ googleSearch: {} }] },
  }));
}

let _plain: GenerativeModel | null = null;
/** Plain cloud text model (no tools) - fallback when search grounding has no quota. */
export function plainCloudModel(): GenerativeModel {
  return (_plain ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: settings.cloud_model },
  }));
}

/** Chrome's on-device model status, straight from the Prompt API. */
type LM = {
  availability: (o?: object) => Promise<string>;
  create: (o?: object) => Promise<{ destroy?: () => void }>;
};
function promptApi(): LM | null {
  return (globalThis as unknown as { LanguageModel?: LM }).LanguageModel ?? null;
}

export async function onDeviceStatus(): Promise<string> {
  const lm = promptApi();
  if (!lm) return "unsupported";
  try {
    return await lm.availability(ON_DEVICE_IO);
  } catch {
    return "unavailable";
  }
}

export async function downloadOnDeviceModel(onProgress: (pct: number) => void): Promise<void> {
  const lm = promptApi();
  if (!lm) throw new Error("This browser has no on-device Prompt API");
  const session = await lm.create({
    ...ON_DEVICE_IO,
    monitor(m: { addEventListener: (t: string, f: (e: { loaded: number }) => void) => void }) {
      m.addEventListener("downloadprogress", (e) => onProgress(Math.round(e.loaded * 100)));
    },
  });
  session.destroy?.();
}
