<script lang="ts">
  import { t } from "$lib/stores/i18n";
  import { appState, currentMonth, currentMonthId, currentWeekId, saveState } from "$lib/stores/budget";
  import { compareMonths, monthDisplayName, inferMonthSortKey, validMonthSortKey } from "$lib/normalize";
  import { addMonthBySortKey, deleteCurrentMonth } from "$lib/stores/months";

  const orderedMonths = $derived(Object.values($appState.months).slice().sort(compareMonths));
  let monthDialog = $state<HTMLDialogElement | null>(null);
  let monthActionsMenu = $state<HTMLDetailsElement | null>(null);
  let newMonthValue = $state("");

  function closeMonthActions() {
    monthActionsMenu?.removeAttribute("open");
  }

  function onMonthChange(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value;
    currentMonthId.set(id);
    currentWeekId.set($appState.months[id]?.weeks[0]?.id);
    saveState();
  }

  function openMonthDialog() {
    closeMonthActions();
    const selectedSortKey = inferMonthSortKey($currentMonth);
    newMonthValue = validMonthSortKey(selectedSortKey) ? selectedSortKey : "";
    monthDialog?.showModal();
  }

  function confirmAddMonth() {
    if (addMonthBySortKey(newMonthValue.trim())) {
      newMonthValue = "";
      monthDialog?.close();
      closeMonthActions();
    }
  }

  async function handleDeleteMonth() {
    await deleteCurrentMonth();
    closeMonthActions();
  }
</script>

<div id="overviewMonthControls" class="overview-month-controls" aria-label="Month controls">
  <label class="field compact-field topbar-control-field">
    <span>{$t("month")}</span>
    <select id="monthSelect" value={$currentMonthId} onchange={onMonthChange}>
      {#each orderedMonths as month (month.id)}
        <option value={month.id}>{monthDisplayName(month)}</option>
      {/each}
    </select>
  </label>
  <details id="monthActionsMenu" bind:this={monthActionsMenu} class="month-actions-menu">
    <summary aria-label="Month actions">•••</summary>
    <div class="month-actions-menu-panel">
      <button id="addMonthBtn" class="secondary-btn month-action-btn" type="button" onclick={openMonthDialog}>
        {$t("addMonth")}
      </button>
      <button id="deleteMonthBtn" class="danger-btn month-action-btn" type="button" onclick={handleDeleteMonth}>
        {$t("deleteMonth")}
      </button>
    </div>
  </details>
</div>

<dialog id="monthDialog" bind:this={monthDialog}>
  <form method="dialog" class="dialog-card">
    <h3>{$t("addMonth")}</h3>
    <label class="field">
      <span>{$t("selectMonth")}</span>
      <input id="newMonthPicker" type="month" bind:value={newMonthValue} />
    </label>
    <div class="dialog-actions">
      <button id="cancelMonthBtn" class="ghost-btn" type="button" onclick={() => monthDialog?.close()}>{$t("cancel")}</button>
      <button id="confirmMonthBtn" class="primary-btn" type="button" onclick={confirmAddMonth}>{$t("addMonth")}</button>
    </div>
  </form>
</dialog>
