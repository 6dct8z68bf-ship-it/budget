<script lang="ts">
  import { t, language, setLanguage } from "$lib/stores/i18n";
  import { theme, toggleTheme } from "$lib/stores/theme";
  import { authState, accountState } from "$lib/stores/auth";
  import { currentView, switchView, type ViewName } from "$lib/stores/router";
  import { doLogout, loadAccountState, loadBudgetState } from "$lib/boot";
  import { switchWorkspace } from "$lib/api";
  import { workspaceSwitchStatus, setWorkspaceSwitchStatus } from "$lib/stores/ui";
  import type { LanguageTag } from "$lib/i18n/dictionary";

  const todayLabel = $derived(
    new Intl.DateTimeFormat($language === "zh" ? "zh-TW" : "en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date()),
  );

  const NAV_TABS: { view: ViewName; key: string }[] = [
    { view: "overview", key: "overview" },
    { view: "entry", key: "entry" },
    { view: "history", key: "history" },
    { view: "settings", key: "settings" },
  ];

  const workspaces = $derived($accountState?.workspaces ?? []);
  const currentWorkspaceId = $derived($accountState?.currentWorkspace?.id ?? "");
  const showWorkspaceSwitcher = $derived(workspaces.length > 0);
  const canLogout = $derived($authState.authEnabled && $authState.authenticated);
  const displayName = $derived(
    $accountState?.account?.displayName ||
      $accountState?.user?.displayName ||
      $accountState?.account?.id ||
      $t("titleUserFallback"),
  );

  function onNavClick(view: ViewName) {
    switchView(view);
  }

  async function onWorkspaceChange(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (!id || id === currentWorkspaceId) return;
    setWorkspaceSwitchStatus($t("workspaceSwitching"));
    try {
      await switchWorkspace(id);
      await loadAccountState();
      await loadBudgetState();
      setWorkspaceSwitchStatus($t("workspaceSwitched"));
    } catch {
      setWorkspaceSwitchStatus($t("workspaceSwitchFailed"));
    }
  }

  function onLanguageChange(event: Event) {
    setLanguage((event.currentTarget as HTMLSelectElement).value as LanguageTag);
  }

</script>

<header class="topbar">
  <div class="brand topbar-brand" id="brandHome" role="link" tabindex="0"
    onclick={() => switchView("overview")}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && switchView("overview")}
  >
    <div class="brand-mark" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
        <rect width="64" height="64" fill="#17201b" />
        <path d="M16 31.5 32 18l16 13.5" fill="none" stroke="#dcecdf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M21 31v17h22V31" fill="none" stroke="#dcecdf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M24 48h16" stroke="#c36b2d" stroke-width="5" stroke-linecap="round" />
        <text x="32" y="42" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#dcecdf">$</text>
      </svg>
    </div>
    <div>
      <time id="topbarToday" class="topbar-today" datetime={new Date().toISOString().slice(0, 10)} aria-label={$t("today")} title={$t("today")}>
        {todayLabel}
      </time>
      <p class="eyebrow topbar-eyebrow">{$t("appSubtitle")}</p>
      <h1>
        <span id="userIdentityLabel" class="user-title-highlight">{displayName}</span>
        <span id="personalTitleSuffix">{$t("personalTitleSuffix")}</span>
      </h1>
    </div>
  </div>

  <div class="topbar-primary-row">
    <nav class="nav-tabs topbar-nav" aria-label="主要檢視">
      {#each NAV_TABS as tab (tab.view)}
        <button
          class="nav-tab"
          class:active={$currentView === tab.view}
          type="button"
          data-view={tab.view}
          aria-current={$currentView === tab.view ? "page" : undefined}
          onclick={() => onNavClick(tab.view)}
        >
          {$t(tab.key)}
        </button>
      {/each}
    </nav>

    <div id="topbarContextControls" class="topbar-context-controls" aria-label="Workspace controls">
      <label
        id="workspaceSwitcher"
        class="field compact-field topbar-control-field workspace-switcher"
        class:hidden={!showWorkspaceSwitcher}
        for="workspaceSelect"
      >
        <span>{$t("workspace")}</span>
        <select id="workspaceSelect" value={currentWorkspaceId} disabled={workspaces.length < 2} onchange={onWorkspaceChange}>
          {#each workspaces as workspace (workspace.id)}
            <option value={workspace.id}>{workspace.name || workspace.id}</option>
          {/each}
        </select>
        <small id="workspaceSwitchStatus" class="workspace-switch-status" role="status" aria-live="polite">{$workspaceSwitchStatus}</small>
      </label>
    </div>

    <div class="topbar-account" aria-label="Account actions">
      <div id="topbarLanguageSlot" class="topbar-language-slot">
        <label class="field language-control compact-field topbar-control-field">
          <span>{$t("language")}</span>
          <select id="languageSelect" value={$language} onchange={onLanguageChange}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <button
        id="themeToggleBtn"
        class="icon-btn theme-toggle-btn"
        type="button"
        onclick={toggleTheme}
        aria-label={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        <span class="theme-toggle-icon" aria-hidden="true">
          {#if $theme === "dark"}
            <svg viewBox="0 0 24 24" role="img" focusable="false">
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" role="img" focusable="false">
              <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
            </svg>
          {/if}
        </span>
      </button>
      {#if canLogout}
        <button
          id="logoutBtn"
          class="icon-btn topbar-logout"
          type="button"
          onclick={doLogout}
          aria-label={$t("logout")}
          title={$t("logout")}
        >
          <span class="logout-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img" focusable="false">
              <path d="M13 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H13" />
              <path d="M11 12h9M16 8l4 4-4 4" />
            </svg>
          </span>
        </button>
      {/if}
    </div>
  </div>
</header>
