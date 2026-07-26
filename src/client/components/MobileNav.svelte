<script lang="ts">
  import { t } from "$lib/stores/i18n";
  import { currentView, switchView, type ViewName } from "$lib/stores/router";

  const TABS: { view: ViewName; key: string; path: string }[] = [
    { view: "overview", key: "overview", path: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" },
    { view: "entry", key: "entry", path: "M7 4h10a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-2.56 1.06L12 15.12l-4.44 4.44A1.5 1.5 0 0 1 5 18.5V6a2 2 0 0 1 2-2Z" },
    { view: "history", key: "history", path: "M6 6h12M6 12h12M6 18h8" },
    { view: "settings", key: "settings", path: "M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" },
  ];
</script>

<nav class="mobile-bottom-nav" aria-label="Mobile navigation">
  {#each TABS as tab (tab.view)}
    <button
      class="mobile-nav-tab"
      class:active={$currentView === tab.view}
      type="button"
      data-view={tab.view}
      aria-current={$currentView === tab.view ? "page" : undefined}
      onclick={() => switchView(tab.view)}
    >
      <span class="mobile-nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d={tab.path} /></svg>
      </span>
      <span>{$t(tab.key)}</span>
    </button>
  {/each}
</nav>
