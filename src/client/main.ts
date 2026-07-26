import "./styles.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { applyThemeEarly } from "$lib/stores/theme";
import { bootstrap } from "$lib/boot";
import { initRouter } from "$lib/stores/router";
import { installDebugApi } from "$lib/debug";

// Set the theme attribute before mount to avoid a flash of the wrong theme.
applyThemeEarly();

// Expose the typed debug surface for e2e diagnostics.
installDebugApi();

const target = document.getElementById("app-root");
if (!target) {
  throw new Error("Missing #app-root mount node");
}

const app = mount(App, { target });

// Attach the popstate listener, then kick off the auth-gated boot sequence
// (meta → session → google → account → state → apply route).
initRouter();
void bootstrap();

export default app;
