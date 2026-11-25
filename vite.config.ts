import { defineConfig } from "vite";

// The Android app runs this build inside the system WebView, which can be older than desktop
// Chrome on some phones, so compile down to syntax that Chrome 90+ understands.
export default defineConfig({
  build: { target: ["es2020", "chrome90"] },
});
