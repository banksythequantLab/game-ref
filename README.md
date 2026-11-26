# Game Ref 🦓

**Meet Zeb the Ref**, a cartoon zebra referee who reacts to every call: a green card for YES, a red card and a whistle for NO, a shrug for IT DEPENDS, a rulebook while he thinks, and a replay tablet for appeals. Zeb's art was rendered locally with ComfyUI (Qwen-Image-Edit 2511, Apache-2.0) and his clips with Wan 2.2 (Apache-2.0); the poses live in [`public/zeb/`](public/zeb) and the logic in [`src/mascot.ts`](src/mascot.ts). The whistle is synthesized with Web Audio (mute button in the header).


**An AI referee that knows every rule and every variation.** Ask "can I do this?" mid-game and get a verdict, the rule it comes from, and a one-line ruling you can read out loud. Most calls run **on your device with Gemini Nano** (instant, offline, free). Tough calls are appealed to **Gemini in the cloud**, which reads the whole rulebook.

Built for **#BuildHybridAI 2026** with the **Firebase AI Logic hybrid inference SDK** (Web / Chrome).

## How it uses Firebase AI Logic

| Job | Inference mode | Why |
|---|---|---|
| First ruling ("Call it") | `InferenceMode.PREFER_ON_DEVICE`, JSON enforced with `onDeviceParams.promptOptions.responseConstraint` **and** `inCloudParams.generationConfig.responseSchema` | Game night happens at kitchen tables, cabins and campsites. Rulings need to be instant and work with no signal. |
| Board photo | Text + JPEG on-device (Gemini Nano multimodal) | "Is this a legal move?" with a picture of the board. |
| Appeal | `ONLY_IN_CLOUD` with the complete rulebook | Escalates automatically when on-device confidence is low or no rule was cited, or when a player taps **Appeal**. |
| Reading a PDF rulebook | `ONLY_IN_CLOUD`, PDF inline, structured output | One time per game. Offline fallback: pdf.js extracts text on the device and Game Ref splits it locally. |
| Find variations | `ONLY_IN_CLOUD` + Grounding with Google Search | Official variants, FAQ/errata and popular house rules, with sources and Search suggestions shown. |

Every ruling shows `response.inferenceSource` (**⚡ On-device** or **☁️ Cloud**), its latency and confidence.

Because Gemini Nano's context is small, Game Ref keeps each rulebook in IndexedDB and uses a local BM25 index to send only the most relevant rule sections (within a character budget) to the on-device model. Active house rules are added to every prompt and override the book.

Other Firebase products: **App Check** (reCAPTCHA Enterprise; debug provider for localhost), **Remote Config** (`cloud_model`, `appeal_model`, `escalate_below`), **Hosting**.

Firebase AI Logic is imported and called at runtime in [`src/firebase.ts`](src/firebase.ts) and [`src/referee.ts`](src/referee.ts).

## Features

- **Any game from Wikipedia**: search a game, Game Ref pulls the article's rules sections (CC BY-SA 4.0), stores them on the device and credits the article on every ruling
- **Zeb's jumbotron**: 5-second clips of Zeb play on each call (whistle on NO, cheer on YES, replay booth during appeals); 🎬 toggle in the header
- **Zeb talks**: rulings are read aloud with the browser's built-in speech (works offline); 🔊 toggle covers voice and whistle
- **Learn to play**: "Teach me this game" (or ask "How do you play gin?") turns the rulebook into a beginner lesson (goal, setup, your turn, how it ends, beginner mistakes), written on-device first like rulings, saved for offline, and Zeb walks you through it step by step out loud
- **Challenge flag**: throw the 🚩 to send a call to the cloud replay booth, which reads the whole rulebook and upholds or overturns it
- **Ask out loud / "Hey Zeb"**: Web Speech recognition, on-device when Chrome has the language pack
- 69 games built in and available offline: original rulebooks for Chess, Checkers and Crazy Eights, plus 66 card, board, dice and yard games whose rules sections come from Wikipedia (CC BY-SA 4.0, credited on every ruling). `node tools/bundle-games.ts` rebuilds `public/games.json`
- Add any game from a PDF or pasted text
- Verdicts: YES / NO / IT DEPENDS, with the cited rule text expandable under each call
- House rules table: toggle variants on and off; they override the rulebook
- Works offline for on-device rulings and text rulebooks

## Run it locally

Requirements: Node 20+, Chrome 139+ (desktop), a Firebase project.

1. In Chrome, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome. The app has a **Download on-device model** button if the model isn't downloaded yet.
2. In the [Firebase console](https://console.firebase.google.com/), create a project, open **AI Logic**, choose the **Gemini Developer API**, and register a web app.
3. Set up **App Check** with reCAPTCHA Enterprise for the web app.
4. Copy `.env.example` to `.env` and fill in the web app config and reCAPTCHA site key.
5. Install and run:
   ```bash
   npm install
   npm run dev
   ```
6. With `VITE_APPCHECK_DEBUG=true`, the browser console prints an App Check debug token. Register it in **App Check > Apps > Manage debug tokens**.

Deploy: `npm run deploy` (Firebase Hosting).

## Project layout

```
src/firebase.ts   Firebase init, App Check, Remote Config, the four AI Logic models
src/referee.ts    On-device rulings, cloud appeals, grounded variation search
src/ingest.ts     PDF/text to rule sections (cloud first, on-device fallback)
src/store.ts      IndexedDB library + BM25 retrieval
src/samples.ts    Built-in rulebooks (original text)
src/main.ts       UI
```

## License

Apache 2.0. Built-in rule summaries are original text describing public-domain games.

## Android app (true on-device on phones)

Chrome on Android doesn't expose Gemini Nano to web pages, so phones get the same app as a small native shell in `android/`:

- The web app is bundled into the APK and loads offline from `assets/web/`.
- Every model call goes through `window.ZebNative` to the **Firebase AI Logic Android SDK** (`firebase-ai` + `firebase-ai-ondevice`).
  - First rulings use `InferenceMode.PREFER_ON_DEVICE`: Gemini Nano through AICore on supported phones, cloud Gemini otherwise.
  - Appeals, PDF reading and variations are cloud only, as on the web.
- Rulings use `generateObject()` with a KSP `@Generable` schema (`Ruling.kt`), so the on-device and cloud models return the same JSON.
- App Check runs natively.
- Zeb talks through Android TextToSpeech.

Build:

```
npm run build
Copy-Item dist android\app\src\main\assets\web -Recurse -Force
cd android; .\gradlew.bat :app:assembleDebug
```

Needs `android/app/google-services.json` (from `firebase apps:sdkconfig ANDROID <appId>`) and, for App Check on a debug build, `android/secrets.properties` with `appcheck.debug.secret=<registered debug token>`. Both files are gitignored.
