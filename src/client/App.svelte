<script lang="ts">
  import AuthOverlay from "$components/AuthOverlay.svelte";
  import AppModal from "$components/AppModal.svelte";
  import Onboarding from "$components/Onboarding.svelte";
  import Topbar from "$components/Topbar.svelte";
  import MobileNav from "$components/MobileNav.svelte";
  import Overview from "$components/views/Overview.svelte";
  import Entry from "$components/views/Entry.svelte";
  import History from "$components/views/History.svelte";
  import Settings from "$components/views/Settings.svelte";
  import { appMeta, appDataReady, isCheckingAuth, shouldShowLogin, shouldShowOverlay } from "$lib/stores/auth";
  import { formatBuildVersion, formatBuildTime } from "$lib/format";
  import { t } from "$lib/stores/i18n";

  // Reactive auth-boundary body classes (mirrors updateAuthUi in app.js). The global
  // styles.css hides .app-shell and shows #authOverlay based on these.
  $effect(() => {
    document.body.classList.toggle("auth-checking", $isCheckingAuth);
    document.body.classList.toggle("landing-open", $shouldShowLogin);
    // auth-locked only applies once auth has resolved (during the checking phase the
    // #authCheckingCard must stay visible; body.auth-locked would hide it).
    document.body.classList.toggle("auth-locked", $shouldShowOverlay && !$isCheckingAuth);
  });

  const buildVersionDisplay = $derived(
    formatBuildVersion($appMeta.buildVersion) || formatBuildTime($appMeta.buildTime),
  );
</script>

<AuthOverlay />

<div id="appShell" class="app-shell" data-app-ready={$appDataReady ? "true" : "false"}>
  <Topbar />

  <main class="workspace">
    <Overview />
    <Entry />
    <History />
    <Settings />
  </main>

  <footer class="app-footer">
    <div class="build-version">
      <span>{$t("buildVersion")}</span>
      <strong id="buildVersionValue" title={$appMeta.buildVersion || $appMeta.buildTime || ""}>
        {buildVersionDisplay}
      </strong>
    </div>
  </footer>

  <MobileNav />
</div>

<AppModal />
<Onboarding />
