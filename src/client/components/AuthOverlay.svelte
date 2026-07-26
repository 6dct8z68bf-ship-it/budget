<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/stores/i18n";
  import {
    authState,
    appMeta,
    shouldShowOverlay,
    shouldShowLogin,
    googleReady,
    buildGoogleLoginUrl,
  } from "$lib/stores/auth";
  import { doLogin } from "$lib/boot";

  let password = $state("");
  let accountId = $state("");
  let errorKey = $state("");
  let loading = $state(false);
  let passwordEl: HTMLInputElement | null = $state(null);

  const googleHref = $derived($googleReady ? buildGoogleLoginUrl() : "/auth/google/start?returnTo=%2Fapp");

  // Contact email button (mirrors bootstrapApp wiring appMeta.contactEmail).
  const contactHref = $derived($appMeta.contactEmail ? `mailto:${$appMeta.contactEmail}` : "#");

  const authCopy = $derived(
    $authState.authenticated
      ? $t("landingAuthCopySignedIn")
      : $googleReady
        ? $t("landingAuthCopyGoogle")
        : !$authState.authEnabled
          ? $t("landingAuthCopyOpen")
          : $t("landingAuthCopyPassword"),
  );

  const authFootnote = $derived(
    $googleReady
      ? $t("landingAuthFootnoteGoogle")
      : $authState.authEnabled
        ? $t("landingAuthFootnotePassword")
        : $t("landingAuthFootnoteOpen"),
  );

  // Focus the password field when the login form appears.
  $effect(() => {
    if ($shouldShowLogin) {
      tick().then(() => passwordEl?.focus());
    } else {
      errorKey = "";
    }
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errorKey = "";
    loading = true;
    try {
      const ok = await doLogin(accountId.trim() ? { accountId: accountId.trim(), password } : { password });
      if (!ok) {
        errorKey = "loginFailed";
        return;
      }
      password = "";
      accountId = "";
    } catch {
      errorKey = "loginFailed";
    } finally {
      loading = false;
    }
  }
</script>

<section id="authOverlay" class="auth-overlay" class:hidden={!$shouldShowOverlay} aria-live="polite">
  <header class="auth-topbar">
    <a class="auth-topbar-brand" href="/" aria-label="Back to home">
      <span class="auth-topbar-name">{$t("appTitle")}</span>
    </a>
  </header>
  <div class="auth-scene">
    <div id="authCheckingCard" class="auth-checking-card" role="status" aria-live="polite">
      <div class="auth-spinner" aria-hidden="true"></div>
      <p class="eyebrow">{$t("checkingAccess")}</p>
      <h2>{$t("checkingAccessTitle")}</h2>
    </div>

    <div class="auth-marketing">
      <div class="landing-brand">
        <div>
          <p class="eyebrow landing-eyebrow">{$t("landingEyebrow")}</p>
          <h2>{$t("appTitle")}</h2>
        </div>
      </div>

      <div class="landing-hero">
        <div class="landing-copy-block">
          <p class="landing-headline">{$t("landingHeadline")}</p>
          <p class="landing-copy">{$t("landingCopy")}</p>
          <div class="landing-actions">
            <a class="primary-btn" href="#trialAccessCard">{$t("landingStartTrialAccess")}</a>
            <a class="ghost-btn" href="#contactUs">{$t("landingContactUs")}</a>
          </div>
        </div>
      </div>

      <div class="landing-panel-grid">
        <section id="contactUs" class="contact-card">
          <p class="eyebrow">{$t("landingContactEyebrow")}</p>
          <h3>{$t("landingContactTitle")}</h3>
          <p>{$t("landingContactCopy")}</p>
          <div class="contact-actions">
            <a id="authContactEmailBtn" class="primary-btn" class:hidden={!$appMeta.contactEmail} href={contactHref}>
              {$t("landingContactEmailBtn")}
            </a>
          </div>
        </section>

        <section id="trialAccessCard" class="auth-card auth-card--landing">
          <div>
            <p class="eyebrow">{$t("landingPrivateWorkspace")}</p>
            <h2>{$t("landingLoginTitle")}</h2>
            <p class="auth-copy">{authCopy}</p>
          </div>
          <a
            id="googleLoginBtn"
            class="google-auth-btn auth-submit"
            class:hidden={!$shouldShowLogin || !$googleReady}
            href={googleHref}
          >
            <span class="google-auth-mark" aria-hidden="true">G</span>
            <span>{$t("continueWithGoogle")}</span>
          </a>
          <div id="authDivider" class="auth-divider" class:hidden={!$shouldShowLogin || !$googleReady}>
            <span>{$t("orPasswordLogin")}</span>
          </div>
          <form id="loginForm" class="auth-form" onsubmit={handleSubmit}>
            <label class="field">
              <span>{$t("loginAccountId")}</span>
              <input id="loginAccountIdInput" type="text" autocomplete="username" bind:value={accountId} />
            </label>
            <label class="field">
              <span>{$t("password")}</span>
              <input
                id="passwordInput"
                type="password"
                autocomplete="current-password"
                bind:value={password}
                bind:this={passwordEl}
              />
            </label>
            <p id="loginError" class="auth-error" class:hidden={!errorKey}>{errorKey ? $t(errorKey) : ""}</p>
            <button id="loginBtn" class="primary-btn auth-submit" type="submit" class:is-loading={loading} disabled={loading}>
              {$t("login")}
            </button>
          </form>
          <p id="landingAuthFootnote" class="auth-footnote">{authFootnote}</p>
        </section>
      </div>
    </div>
  </div>
</section>
