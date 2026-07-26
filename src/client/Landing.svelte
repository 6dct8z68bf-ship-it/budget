<script lang="ts">
  import { onMount } from "svelte";
  import { derived } from "svelte/store";
  import { language, setLanguage } from "$lib/stores/i18n";
  import { translateLanding } from "$lib/i18n/landing";
  import { fetchMeta, fetchSession, fetchGoogleAuthStatus } from "$lib/api";
  import type { LanguageTag } from "$lib/i18n/dictionary";

  // Landing-specific translations (Google-first wording) with fallback to the main i18n.
  const t = derived(language, ($language) => (key: string) => translateLanding($language, key));

  let authEnabled = $state(false);
  let authenticated = $state(false);
  let googleEnabled = $state(false);
  let googleConfigured = $state(false);
  let loginUrl = $state("/auth/google/start?returnTo=%2Fapp");
  let contactEmail = $state("");

  const googleReady = $derived(googleEnabled && googleConfigured);
  const authCopy = $derived(
    authenticated
      ? $t("landingAuthCopySignedIn")
      : googleReady
        ? $t("landingAuthCopyGoogle")
        : !authEnabled
          ? $t("landingAuthCopyOpen")
          : $t("landingAuthCopyPassword"),
  );
  const authFootnote = $derived(
    googleReady ? $t("landingAuthFootnoteGoogle") : authEnabled ? $t("landingAuthFootnotePassword") : $t("landingAuthFootnoteOpen"),
  );
  const enterLabel = $derived(authenticated ? $t("landingOpenWorkspace") : $t("login"));

  // Keep <html lang> + title in sync (the shared i18n store already persists language).
  $effect(() => {
    if (typeof document !== "undefined") document.title = $t("appTitle");
  });

  onMount(async () => {
    try {
      const [meta, session, google] = await Promise.all([
        fetchMeta().catch(() => ({ authEnabled: false, contactEmail: "" })),
        fetchSession().catch(() => ({ authenticated: false })),
        fetchGoogleAuthStatus().catch(() => ({ enabled: false, configured: false, loginUrl })),
      ]);
      authEnabled = !!(meta as { authEnabled?: boolean }).authEnabled;
      authenticated = !!(session as { authenticated?: boolean }).authenticated;
      googleEnabled = !!(google as { enabled?: boolean }).enabled;
      googleConfigured = !!(google as { configured?: boolean }).configured;
      loginUrl = (google as { loginUrl?: string }).loginUrl || loginUrl;
      contactEmail = (meta as { contactEmail?: string }).contactEmail || "";
    } catch {
      /* keep defaults */
    }
  });
</script>

<main class="auth-overlay" aria-live="polite">
  <div class="auth-scene">
    <div class="auth-marketing">
      <div class="landing-brand">
        <div class="brand-mark landing-brand-mark">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
            <rect width="64" height="64" fill="#17201b" />
            <path d="M16 31.5 32 18l16 13.5" fill="none" stroke="#dcecdf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M21 31v17h22V31" fill="none" stroke="#dcecdf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M24 48h16" stroke="#c36b2d" stroke-width="5" stroke-linecap="round" />
            <text x="32" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#dcecdf">$</text>
          </svg>
        </div>
        <div>
          <p class="eyebrow landing-eyebrow">{$t("landingEyebrow")}</p>
          <h2>{$t("appTitle")}</h2>
        </div>
        <label class="field landing-language-field">
          <span>{$t("language")}</span>
          <select id="landingLanguageSelect" value={$language} onchange={(e) => setLanguage((e.currentTarget as HTMLSelectElement).value as LanguageTag)}>
            <option value="en">English</option>
            <option value="zh">繁體中文</option>
          </select>
        </label>
      </div>

      <div class="landing-hero">
        <div class="landing-copy-block">
          <p class="landing-headline">{$t("landingHeadline")}</p>
          <p class="landing-copy">{$t("landingCopy")}</p>
          <div class="landing-actions">
            <a id="landingGoogleHeroLink" class="primary-btn" class:hidden={!googleReady} href={loginUrl}>{$t("continueWithGoogle")}</a>
            <a id="landingTrialAccessLink" class="primary-btn" class:hidden={googleReady} href="#trialAccessCard">{$t("landingStartWithGoogle")}</a>
            <a class="ghost-btn" href="#contactUs">{$t("landingContactUs")}</a>
          </div>
          <div class="landing-link-row" aria-label={$t("landingExploreTitle")}>
            <span class="landing-link-caption">{$t("landingExploreTitle")}</span>
            <a href="/guide">{$t("landingGuideLink")}</a>
            <a href="/faq">{$t("landingFaqLink")}</a>
            <a href="/privacy">{$t("landingPrivacyLink")}</a>
            <a href="/terms">{$t("landingTermsLink")}</a>
          </div>
          <div class="landing-pill-row" id="landingHighlightsRow" aria-label={$t("landingHighlightsAria")}>
            <span class="landing-pill">{$t("landingPillStatement")}</span>
            <span class="landing-pill">{$t("landingPillTrend")}</span>
            <span class="landing-pill">{$t("landingPillReview")}</span>
          </div>
        </div>

        <div class="landing-visual-stage" id="landingVisualStage" aria-label={$t("landingVisualAria")}>
          <div class="visual-story-badge visual-story-badge-top">{$t("landingPillStatement")}</div>
          <figure class="product-shot product-shot-main">
            <img id="landingStatementImage" src="/assets/landing-statement-card.png" alt={$t("landingStatementImageAlt")} />
          </figure>
          <div class="visual-motion-line visual-motion-line-1" aria-hidden="true"></div>
          <div class="visual-motion-line visual-motion-line-2" aria-hidden="true"></div>
          <div class="visual-glow visual-glow-main" aria-hidden="true"></div>
          <div class="visual-story-badge visual-story-badge-bottom">{$t("landingPillTrend")}</div>
          <figure class="product-shot product-shot-detail">
            <img id="landingTrendImage" src="/assets/landing-trend-graph-card.png" alt={$t("landingTrendImageAlt")} />
          </figure>
        </div>
      </div>

      <div class="landing-panel-grid">
        <section id="trialSteps" class="trial-card">
          <p class="eyebrow">{$t("landingTrialEyebrow")}</p>
          <h3 id="landingTrialTitle">{$t("landingTrialTitle")}</h3>
          <ol class="trial-list">
            <li><span class="trial-step-number">1</span><div><strong>{$t("landingStep1Title")}</strong><p>{$t("landingStep1Copy")}</p></div></li>
            <li><span class="trial-step-number">2</span><div><strong>{$t("landingStep2Title")}</strong><p>{$t("landingStep2Copy")}</p></div></li>
            <li><span class="trial-step-number">3</span><div><strong>{$t("landingStep3Title")}</strong><p>{$t("landingStep3Copy")}</p></div></li>
          </ol>
        </section>

        <section id="contactUs" class="contact-card">
          <p class="eyebrow">{$t("landingContactEyebrow")}</p>
          <h3>{$t("landingContactTitle")}</h3>
          <p>{$t("landingContactCopy")}</p>
          <div class="contact-actions">
            <a id="landingContactEmailBtn" class="primary-btn" class:hidden={!contactEmail} href={contactEmail ? `mailto:${contactEmail}` : "#"}>
              {$t("landingContactEmailBtn")}
            </a>
            <a class="ghost-btn" href="#trialAccessCard">{$t("landingContactAction")}</a>
          </div>
        </section>

        <section id="trialAccessCard" class="auth-card auth-card--landing">
          <div>
            <p class="eyebrow">{$t("landingPrivateWorkspace")}</p>
            <h2>{$t("landingLoginTitle")}</h2>
            <p id="landingAuthCopy" class="auth-copy">{authCopy}</p>
          </div>
          <a id="landingGoogleLoginLink" class="google-auth-btn auth-submit" class:hidden={!googleReady} href={loginUrl}>
            <span class="google-auth-mark" aria-hidden="true">G</span>
            <span>{$t("continueWithGoogle")}</span>
          </a>
          <a id="enterWorkspaceLink" class="auth-submit" class:ghost-btn={googleReady} class:primary-btn={!googleReady} href="/app">{enterLabel}</a>
          <p id="landingAuthFootnote" class="auth-footnote">{authFootnote}</p>
        </section>
      </div>
    </div>
  </div>
</main>
