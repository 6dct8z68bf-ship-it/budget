<script lang="ts">
  import { t, categoryLabel } from "$lib/stores/i18n";
  import { appState, currentMonth, currentMonthId, currentWeekId, saveState, setBudgetState } from "$lib/stores/budget";
  import { accountState, adminAccounts, authState } from "$lib/stores/auth";
  import {
    currentView,
    currentSettingsSection,
    availableSettingsSections,
    switchSettingsSection,
    type SettingsSection,
  } from "$lib/stores/router";
  import { loadAccountState, loadBudgetState } from "$lib/boot";
  import * as api from "$lib/api";
  import { saveMonthSettings } from "$lib/stores/months";
  import { findUserMerchantRule, saveMerchantRule, updateMerchantRuleCategory, deleteMerchantRule } from "$lib/merchantRules";
  import { categoryDefinitions, compareMonths, monthDisplayName, normalizeState } from "$lib/normalize";
  import type { ResolvedCategory } from "$lib/normalize";
  import { valueForInput } from "$lib/format";
  import { confirmDialog, alertDialog, promptDialog } from "$lib/stores/modal";
  import { setWorkspaceSwitchStatus } from "$lib/stores/ui";

  const SECTIONS: { key: SettingsSection; label: string }[] = [
    { key: "data", label: "settingsSectionData" },
    { key: "workspace", label: "settingsSectionWorkspace" },
    { key: "security", label: "settingsSectionSecurity" },
    { key: "admin", label: "settingsSectionAdmin" },
  ];
  function hidden(section: SettingsSection): boolean {
    return $currentView !== "settings" || $currentSettingsSection !== section;
  }

  // status helper
  function flash(setter: (v: string) => void, message: string, ms = 3000) {
    setter(message);
    setTimeout(() => setter(""), ms);
  }

  // ---- Profile ----
  let profileName = $state("");
  let profileStatus = $state("");
  $effect(() => {
    const id = $accountState?.account || $accountState?.user;
    profileName = id?.displayName || "";
  });
  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    const displayName = profileName.trim();
    if (displayName.length < 2 || displayName.length > 80) {
      flash((v) => (profileStatus = v), "Display name must be between 2 and 80 characters.");
      return;
    }
    try {
      await api.updateProfile(displayName);
      await loadAccountState();
      flash((v) => (profileStatus = v), "Profile saved.");
    } catch {
      flash((v) => (profileStatus = v), "Failed to save profile.");
    }
  }

  // ---- Month data ----
  let monthName = $state("");
  let creditLimit = $state("");
  $effect(() => {
    const m = $currentMonth;
    monthName = m ? monthDisplayName(m) : "";
    creditLimit = valueForInput(m?.creditLimit);
  });
  function saveMonth() {
    saveMonthSettings(monthName, creditLimit === "" ? null : Number(creditLimit));
  }

  // ---- Backup ----
  function exportData() {
    const blob = new Blob([JSON.stringify($appState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `family-budget-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function importData(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = normalizeState(JSON.parse(String(reader.result)));
        setBudgetState(state);
      } catch {
        void alertDialog($t("importFailed"));
      } finally {
        input.value = "";
      }
    };
    reader.readAsText(file);
  }

  // ---- Category table ----
  function categoryTypePillClass(type: string): { cls: string; label: string } {
    return type === "incidental"
      ? { cls: "pill warn", label: $t("incidentalType") }
      : { cls: "pill", label: $t("nonGrocery") };
  }

  const workspaceCategories = $derived(categoryDefinitions($appState.categorySettings, { includeArchived: true }));
  let categoryStatus = $state("");
  let newCategoryLabel = $state("");
  let newCategoryType = $state<"nonGrocery" | "incidental">("nonGrocery");
  let newCategoryHint = $state("");

  function categoryLabelFor(category: ResolvedCategory): string {
    const override = $appState.categorySettings?.labelOverrides?.[category.key];
    if (override) return override;
    return category.source === "system" ? $categoryLabel(category.key) : category.label;
  }

  function categoryKeyForLabel(label: string): string {
    const slug = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);
    const base = `custom_${slug || "category"}`;
    const existing = new Set([...workspaceCategories.map((category) => category.key), "grocery"]);
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
  }

  async function addCategory(event: SubmitEvent) {
    event.preventDefault();
    const label = newCategoryLabel.trim();
    if (label.length < 2) {
      flash((value) => (categoryStatus = value), $t("categoryNameInvalid"));
      return;
    }
    const key = categoryKeyForLabel(label);
    appState.update((state) => ({
      ...state,
      categorySettings: {
        ...(state.categorySettings || { version: 1, customCategories: [], archivedCategoryKeys: [], labelOverrides: {}, hintOverrides: {} }),
        customCategories: [
          ...(state.categorySettings?.customCategories || []),
          { key, label, type: newCategoryType, hint: newCategoryHint.trim() },
        ],
      },
    }));
    await saveState();
    newCategoryLabel = "";
    newCategoryHint = "";
    flash((value) => (categoryStatus = value), $t("categoryAdded"));
  }

  async function editCategory(category: ResolvedCategory) {
    const nextLabel = await promptDialog($t("categoryEditNamePrompt"), {
      title: $t("categoryEditTitle"),
      fieldLabel: $t("categoryName"),
      defaultValue: categoryLabelFor(category),
    });
    if (typeof nextLabel !== "string" || nextLabel.trim().length < 2) return;
    const nextHint = await promptDialog($t("categoryEditHintPrompt"), {
      title: $t("categoryEditTitle"),
      fieldLabel: $t("categoryHint"),
      defaultValue: category.hint,
    });
    if (typeof nextHint !== "string") return;
    appState.update((state) => {
      const settings = state.categorySettings || { version: 1, customCategories: [], archivedCategoryKeys: [], labelOverrides: {}, hintOverrides: {} };
      if (category.source === "custom") {
        settings.customCategories = settings.customCategories.map((item) =>
          item.key === category.key ? { ...item, label: nextLabel.trim(), hint: nextHint.trim() } : item,
        );
      } else {
        settings.labelOverrides = { ...settings.labelOverrides, [category.key]: nextLabel.trim() };
        settings.hintOverrides = { ...settings.hintOverrides, [category.key]: nextHint.trim() };
      }
      return { ...state, categorySettings: settings };
    });
    await saveState();
    flash((value) => (categoryStatus = value), $t("categorySaved"));
  }

  async function toggleCategoryArchive(category: ResolvedCategory) {
    const nextArchived = !category.archived;
    if (nextArchived && !(await confirmDialog($t("categoryArchiveConfirm", categoryLabelFor(category)), { title: $t("categoryArchiveTitle"), tone: "danger" }))) return;
    appState.update((state) => {
      const settings = state.categorySettings || { version: 1, customCategories: [], archivedCategoryKeys: [], labelOverrides: {}, hintOverrides: {} };
      const keys = new Set(settings.archivedCategoryKeys);
      if (nextArchived) keys.add(category.key);
      else keys.delete(category.key);
      return { ...state, categorySettings: { ...settings, archivedCategoryKeys: Array.from(keys) } };
    });
    await saveState();
    flash((value) => (categoryStatus = value), nextArchived ? $t("categoryArchived") : $t("categoryRestored"));
  }

  // ---- Merchant rules ----
  const merchantRules = $derived(
    ($appState.merchantRules ?? []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
  );
  let newRuleMerchant = $state("");
  let newRuleCategory = $state("shoppingDining");
  let merchantRuleStatus = $state("");

  function merchantRuleCategoryLabel(category: ResolvedCategory): string {
    const label = categoryLabelFor(category);
    return category.archived ? `${label} (${$t("categoryArchivedStatus")})` : label;
  }

  async function addMerchantRule(event: SubmitEvent) {
    event.preventDefault();
    const merchant = newRuleMerchant.trim();
    if (!merchant) {
      flash((value) => (merchantRuleStatus = value), $t("merchantRulesMerchantInvalid"));
      return;
    }
    if (findUserMerchantRule($appState, merchant)) {
      flash((value) => (merchantRuleStatus = value), $t("merchantRulesDuplicate"));
      return;
    }
    await saveMerchantRule({ merchantRawExample: merchant, categoryKey: newRuleCategory });
    newRuleMerchant = "";
    flash((value) => (merchantRuleStatus = value), $t("merchantRulesSaved"));
  }

  async function removeRule(id: string) {
    if (!(await confirmDialog($t("merchantRulesDeleteConfirm"), { title: $t("merchantRulesDeleteConfirmTitle"), tone: "danger" }))) return;
    await deleteMerchantRule(id);
    flash((value) => (merchantRuleStatus = value), $t("merchantRulesDeleted"));
  }

  async function changeMerchantRuleCategory(ruleId: string, categoryKey: string) {
    await updateMerchantRuleCategory(ruleId, categoryKey);
    flash((value) => (merchantRuleStatus = value), $t("merchantRulesUpdated"));
  }

  // ---- Workspace management ----
  let workspaceSel = $state("");
  let workspaceStatus = $state("");
  let workspaceActionsMenu = $state<HTMLDetailsElement | null>(null);
  const workspaces = $derived($accountState?.workspaces ?? []);
  $effect(() => {
    if (!workspaces.some((w) => w.id === workspaceSel)) {
      workspaceSel = $accountState?.currentWorkspace?.id || workspaces[0]?.id || "";
    }
  });
  const selectedWorkspace = $derived(workspaces.find((w) => w.id === workspaceSel) || null);
  function closeWorkspaceActions() {
    workspaceActionsMenu?.removeAttribute("open");
  }
  async function createWorkspace() {
    closeWorkspaceActions();
    const name = await promptDialog($t("createWorkspacePrompt"), {
      title: $t("createWorkspaceTitle"),
      fieldLabel: $t("workspaceName"),
    });
    if (typeof name !== "string" || !name.trim()) return;
    try {
      setWorkspaceSwitchStatus($t("workspaceSwitching"));
      const result = (await api.createWorkspace(name.trim())) as { workspace?: { id: string } };
      await loadAccountState();
      if (result.workspace?.id) {
        await api.switchWorkspace(result.workspace.id);
        await loadAccountState();
        await loadBudgetState();
      }
      setWorkspaceSwitchStatus($t("workspaceSwitched"));
    } catch {
      flash((v) => (workspaceStatus = v), $t("createWorkspaceFailed"));
    }
  }
  async function renameWorkspace() {
    closeWorkspaceActions();
    if (!selectedWorkspace) return;
    const currentName = selectedWorkspace.name || selectedWorkspace.id;
    const name = await promptDialog($t("renameWorkspacePrompt"), {
      title: $t("renameWorkspaceTitle"),
      fieldLabel: $t("workspaceName"),
      defaultValue: currentName,
    });
    if (typeof name !== "string" || !name.trim()) return;
    try {
      await api.renameWorkspace(selectedWorkspace.id, name.trim());
      await loadAccountState();
      flash((v) => (workspaceStatus = v), $t("workspaceRenameSuccess"));
    } catch {
      flash((v) => (workspaceStatus = v), $t("workspaceRenameFailed"));
    }
  }
  async function deleteWorkspace() {
    closeWorkspaceActions();
    if (!selectedWorkspace) return;
    const name = selectedWorkspace.name || selectedWorkspace.id;
    if (!(await confirmDialog($t("workspaceDeleteConfirm", name)))) return;
    const previous = $accountState?.currentWorkspace?.id;
    try {
      await api.deleteWorkspace(selectedWorkspace.id);
      await loadAccountState();
      if (selectedWorkspace.id === previous) await loadBudgetState();
      flash((v) => (workspaceStatus = v), $t("workspaceDeleteSuccess"));
    } catch {
      flash((v) => (workspaceStatus = v), $t("workspaceDeleteFailed"));
    }
  }

  // ---- Security (password change) ----
  let curPw = $state("");
  let newPw = $state("");
  let confirmPw = $state("");
  let securityStatus = $state("");
  const account = $derived($accountState?.account || $accountState?.user || null);
  const isGoogleAccount = $derived(account?.authProvider === "google");
  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      flash((v) => (securityStatus = v), $t("passwordMismatch"));
      return;
    }
    try {
      await api.changePassword({ currentPassword: curPw, newPassword: newPw, confirmPassword: confirmPw });
      curPw = newPw = confirmPw = "";
      flash((v) => (securityStatus = v), $t("passwordChangeSuccess"));
    } catch {
      flash((v) => (securityStatus = v), $t("passwordChangeFailed"));
    }
  }

  // ---- Admin (create account, managed list, reset) ----
  let acctId = $state("");
  let acctName = $state("");
  let acctEmail = $state("");
  let acctWorkspace = $state("");
  let acctPw = $state("");
  let adminStatus = $state("");
  let adminResult = $state<{ account?: { id?: string; displayName?: string }; workspace?: { id?: string; name?: string } } | null>(null);
  const currentAccountId = $derived($accountState?.account?.id || "");
  const managedAccounts = $derived($adminAccounts.filter((a) => a.id && a.id !== currentAccountId));
  const resettable = $derived(
    $adminAccounts.filter((a) => a.id && a.id !== currentAccountId && (a.authProvider || "password") === "password"),
  );
  let resetSel = $state("");
  let resetPw = $state("");
  let resetConfirm = $state("");
  let resetStatus = $state("");
  $effect(() => {
    if (!resettable.some((a) => a.id === resetSel)) resetSel = resettable[0]?.id || "";
  });

  async function createAccount(e: SubmitEvent) {
    e.preventDefault();
    const payload: Record<string, string> = {
      accountId: acctId.trim(),
      displayName: acctName.trim(),
      email: acctEmail.trim(),
      password: acctPw,
      workspaceName: acctWorkspace.trim(),
    };
    Object.keys(payload).forEach((k) => payload[k] === "" && delete payload[k]);
    try {
      const result = (await api.createAccount(payload as { password: string })) as {
        account?: { id?: string; displayName?: string };
        workspace?: { id?: string; name?: string };
      };
      adminResult = result;
      acctPw = "";
      await loadAccountState();
      $adminAccounts = await api.fetchAdminAccounts();
      flash(
        (v) => (adminStatus = v),
        $t("accountCreateSuccess", result.account?.displayName || acctName || acctId, result.workspace?.name || acctWorkspace),
      );
    } catch (err) {
      const dup = (err as api.ApiError)?.status === 409;
      flash((v) => (adminStatus = v), dup ? $t("accountCreateDuplicate") : $t("accountCreateFailed"));
    }
  }
  async function promote(id: string, label: string) {
    try {
      await api.setAccountStatus(id, "standard");
      $adminAccounts = await api.fetchAdminAccounts();
      flash((v) => (adminStatus = v), $t("accountPromoteSuccess", label));
    } catch {
      flash((v) => (adminStatus = v), $t("accountPromoteFailed"));
    }
  }
  async function removeAccount(id: string, label: string) {
    if (!(await confirmDialog($t("accountDeleteConfirm", label), { title: $t("deleteAccount"), confirmLabel: $t("deleteAccount") }))) return;
    try {
      await api.deleteAccount(id);
      await loadAccountState();
      $adminAccounts = await api.fetchAdminAccounts();
      flash((v) => (adminStatus = v), $t("accountDeleteSuccess", label));
    } catch {
      flash((v) => (adminStatus = v), $t("accountDeleteFailed"));
    }
  }
  async function resetAccountPassword(e: SubmitEvent) {
    e.preventDefault();
    if (!resetSel) return;
    if (resetPw !== resetConfirm) {
      flash((v) => (resetStatus = v), $t("passwordMismatch"));
      return;
    }
    try {
      const result = (await api.resetAccountPassword(resetSel, {
        newPassword: resetPw,
        confirmPassword: resetConfirm,
      })) as { account?: { id?: string; displayName?: string } };
      resetPw = resetConfirm = "";
      $adminAccounts = await api.fetchAdminAccounts();
      flash((v) => (resetStatus = v), $t("accountResetSuccess", result.account?.displayName || result.account?.id || resetSel));
    } catch {
      flash((v) => (resetStatus = v), $t("accountResetFailed"));
    }
  }

  function statusLabel(a: Record<string, unknown> | null | undefined): string {
    return a?.accountStatus === "trial" ? $t("trialAccount") : $t("activeAccount");
  }
</script>

<section class="view" class:active={$currentView === "settings"} id="settingsView">
  <div class="page-head">
    <div><p class="eyebrow">{$t("settings")}</p><h2>{$t("settingsWorkspaceTitle")}</h2></div>
  </div>

  <nav id="settingsSectionNav" class="settings-section-nav" aria-label="Settings sections">
    {#each SECTIONS as section (section.key)}
      <button
        class="settings-section-tab"
        class:active={$currentSettingsSection === section.key}
        class:hidden={!$availableSettingsSections.includes(section.key)}
        type="button"
        data-settings-section={section.key}
        disabled={!$availableSettingsSections.includes(section.key)}
        aria-current={$currentSettingsSection === section.key ? "page" : undefined}
        onclick={() => switchSettingsSection(section.key)}
      >
        {$t(section.label)}
      </button>
    {/each}
  </nav>

  <!-- PROFILE -->
  <!-- DATA: month settings -->
  <section id="monthDataPanel" class="panel" data-settings-panel data-settings-section="data" class:settings-section-hidden={hidden("data")}>
    <div class="panel-head">
      <div><h3>{$t("monthData")}</h3><p>{$t("monthDataSub")}</p></div>
      <button id="saveMonthSettingsBtn" class="primary-btn" type="button" onclick={saveMonth}>{$t("save")}</button>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>{$t("currentMonth")}</span>
        <select id="monthDataSelect" value={$currentMonthId} onchange={(event) => {
          const id = (event.currentTarget as HTMLSelectElement).value;
          currentMonthId.set(id);
          currentWeekId.set($appState.months[id]?.weeks[0]?.id);
        }}>
          {#each Object.values($appState.months).slice().sort(compareMonths) as monthOption (monthOption.id)}
            <option value={monthOption.id}>{monthDisplayName(monthOption)}</option>
          {/each}
        </select>
      </label>
      <label class="field"><span>{$t("creditLimit")}</span><input id="creditLimitInput" type="number" min="0" step="0.01" bind:value={creditLimit} /></label>
    </div>
  </section>

  <!-- DATA: backup -->
  <section id="backupPanel" class="panel" data-settings-panel data-settings-section="data" class:settings-section-hidden={hidden("data")}>
    <div class="panel-head"><div><h3>{$t("backup")}</h3><p>{$t("backupSub")}</p></div></div>
    <div class="data-actions">
      <button id="exportDataBtn" class="secondary-btn" type="button" onclick={exportData}>{$t("exportJson") || "Export JSON"}</button>
      <label class="secondary-btn file-btn">
        <span>{$t("importJson")}</span>
        <input id="importDataInput" type="file" accept="application/json,.json" onchange={importData} />
      </label>
    </div>
  </section>

  <!-- DATA: category table -->
  <section id="categorySettingsPanel" class="panel" data-settings-panel data-settings-section="data" class:settings-section-hidden={hidden("data")}>
    <div class="panel-head"><div><h3>{$t("categorySettings")}</h3><p>{$t("categorySettingsSub")}</p></div></div>
    <form id="categoryCreateForm" class="category-create-form" onsubmit={addCategory}>
      <div class="form-grid">
        <label class="field"><span>{$t("categoryName")}</span><input id="newCategoryNameInput" type="text" bind:value={newCategoryLabel} placeholder={$t("categoryNamePlaceholder")} /></label>
        <label class="field"><span>{$t("categoryType")}</span>
          <select id="newCategoryTypeInput" bind:value={newCategoryType}>
            <option value="nonGrocery">{$t("nonGrocery")}</option>
            <option value="incidental">{$t("incidentals")}</option>
          </select>
        </label>
        <label class="field"><span>{$t("categoryHint")}</span><input id="newCategoryHintInput" type="text" bind:value={newCategoryHint} placeholder={$t("categoryHintPlaceholder")} /></label>
      </div>
      <div class="category-create-actions">
        <button id="addCategoryBtn" class="secondary-btn" type="submit">{$t("addCategory")}</button>
        <p id="categorySettingsStatus" class="save-status" class:hidden={!categoryStatus} role="status" aria-live="polite">{categoryStatus}</p>
      </div>
    </form>
    <div class="table-scroll">
      <table id="categoryTable">
        <thead><tr><th>Key</th><th>{$t("category")}</th><th>{$t("type")}</th><th>{$t("ruleHint")}</th><th>{$t("categoryStatus")}</th><th></th></tr></thead>
        <tbody>
          {#each workspaceCategories as category (category.key)}
            {@const pill = categoryTypePillClass(category.type)}
            <tr class:category-row-archived={category.archived} data-category-key={category.key}>
              <td>{category.key}</td>
              <td>{categoryLabelFor(category)}</td>
              <td><span class={pill.cls}>{pill.label}</span></td>
              <td>{category.hint || "—"}</td>
              <td><span class:warn={category.archived} class="pill">{category.archived ? $t("categoryArchivedStatus") : $t("categoryActiveStatus")}</span></td>
              <td class="category-row-actions">
                <button type="button" class="ghost-btn" data-category-action="edit" onclick={() => editCategory(category)}>{$t("categoryEdit")}</button>
                <button type="button" class="ghost-btn" data-category-action={category.archived ? "restore" : "archive"} onclick={() => toggleCategoryArchive(category)}>
                  {category.archived ? $t("categoryRestore") : $t("categoryArchive")}
                </button>
              </td>
            </tr>
          {/each}
          <tr data-category-key="grocery">
            <td>grocery</td><td>{$t("grocery")}</td>
            <td><span class="pill">{$t("autoCalculated")}</span></td>
            <td>{$t("weeklyTotal")} - {$t("nonGrocery")} - {$t("incidentals")}</td><td><span class="pill">{$t("categorySystemStatus")}</span></td><td></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- DATA: merchant rules -->
  <section id="merchantRulesPanel" class="panel merchant-rules-panel" data-settings-panel data-settings-section="data" class:settings-section-hidden={hidden("data")}>
    <div class="panel-head"><div><h3>{$t("merchantRulesTitle")}</h3><p>{$t("merchantRulesSub")}</p></div></div>
    <form id="merchantRuleCreateForm" class="merchant-rule-create-form" onsubmit={addMerchantRule}>
      <div class="form-grid">
        <label class="field"><span>{$t("merchantRulesMerchant")}</span><input id="merchantRuleMerchantInput" type="text" bind:value={newRuleMerchant} placeholder={$t("merchantRulesMerchantPlaceholder")} /></label>
        <label class="field"><span>{$t("merchantRulesCategory")}</span>
          <select id="merchantRuleCategorySelect" bind:value={newRuleCategory}>
            <option value="grocery">{$t("grocery")}</option>
            {#each workspaceCategories as category (category.key)}
              <option value={category.key} disabled={category.archived}>{merchantRuleCategoryLabel(category)}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="merchant-rule-create-actions">
        <button id="saveMerchantRuleBtn" class="secondary-btn" type="submit">{$t("merchantRulesAdd")}</button>
        <p id="merchantRuleStatus" class="save-status" class:hidden={!merchantRuleStatus} role="status" aria-live="polite">{merchantRuleStatus}</p>
      </div>
    </form>
    <div class="table-scroll">
      <table class="merchant-rules-table">
        <thead><tr><th>{$t("merchantRulesMerchant")}</th><th>{$t("merchantRulesCategory")}</th><th>{$t("merchantRulesAdded")}</th><th></th></tr></thead>
        <tbody id="merchantRulesTableBody">
          {#if merchantRules.length === 0}
            <tr class="merchant-rules-empty-row"><td colspan="4">{$t("merchantRulesEmpty")}</td></tr>
          {:else}
            {#each merchantRules as rule (rule.id)}
              <tr data-rule-id={rule.id}>
                <td class="merchant-rules-cell-merchant" title={rule.merchantNormalized}>{rule.merchantRawExample || rule.merchantNormalized}</td>
                <td class="merchant-rules-cell-category">
                  <select data-rule-category value={rule.categoryKey} onchange={(e) => changeMerchantRuleCategory(rule.id, (e.currentTarget as HTMLSelectElement).value)}>
                    <option value="grocery">{$t("grocery")}</option>
                    {#each workspaceCategories as cat (cat.key)}<option value={cat.key} disabled={cat.archived && rule.categoryKey !== cat.key}>{merchantRuleCategoryLabel(cat)}</option>{/each}
                  </select>
                </td>
                <td class="merchant-rules-cell-added">{rule.createdAt ? rule.createdAt.slice(0, 10) : "—"}</td>
                <td class="merchant-rules-cell-action">
                  <button type="button" class="ghost-btn merchant-rules-delete-btn" data-delete-rule={rule.id} onclick={() => removeRule(rule.id)}>{$t("merchantRulesDelete")}</button>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>

  <!-- WORKSPACE -->
  <section id="workspaceManagementPanel" class="panel workspace-management-panel" data-settings-panel data-settings-section="workspace" class:settings-section-hidden={hidden("workspace")}>
    <div class="panel-head">
      <div><h3>{$t("workspaceManagementTitle")}</h3><p>{$t("workspaceManagementSub")}</p></div>
      <details id="workspaceActionsMenu" bind:this={workspaceActionsMenu} class="month-actions-menu workspace-actions-menu">
        <summary aria-label={$t("workspaceActions")}>&#x2022;&#x2022;&#x2022;</summary>
        <div class="month-actions-menu-panel workspace-actions-menu-panel">
          <button id="createWorkspaceBtn" class="ghost-btn month-action-btn" type="button" onclick={createWorkspace}>{$t("createWorkspace")}</button>
          <button id="renameWorkspaceBtn" class="primary-btn month-action-btn" type="button" disabled={!selectedWorkspace} onclick={renameWorkspace}>{$t("renameWorkspace")}</button>
          <button id="deleteWorkspaceBtn" class="danger-btn month-action-btn" type="button" disabled={!selectedWorkspace || workspaces.length < 2} onclick={deleteWorkspace}>{$t("deleteWorkspace")}</button>
        </div>
      </details>
    </div>
    <div id="workspaceManagementForm" class="workspace-management-form">
      <div class="form-grid">
        <label class="field">
          <span>{$t("workspace")}</span>
          <select id="workspaceManageSelect" bind:value={workspaceSel}>
            {#each workspaces as w (w.id)}<option value={w.id}>{w.name || w.id}</option>{/each}
          </select>
        </label>
      </div>
      <p id="workspaceManagementStatus" class="save-status" class:hidden={!workspaceStatus} role="status" aria-live="polite">{workspaceStatus}</p>
    </div>
  </section>

  <!-- SECURITY -->
  <section id="accountSecurityPanel" class="panel account-security-panel" data-settings-panel data-settings-section="security" class:settings-section-hidden={hidden("security")}>
    <div class="panel-head"><div><h3>{$t("accountSecurityTitle")}</h3><p>{$t("accountSecuritySub")}</p></div></div>
    <div id="accountSecurityIdentity" class="account-security-identity">
      {#if account}
        <strong>{$t("signedInAccount")}</strong>
        <dl>
          <div><dt>{$t("accountId")}</dt><dd>{account.id || "-"}</dd></div>
          <div><dt>{$t("displayName")}</dt><dd>{account.displayName || "-"}</dd></div>
          <div><dt>{$t("emailOptional")}</dt><dd>{account.email || "-"}</dd></div>
          <div><dt>{$t("accountStatus")}</dt><dd>{statusLabel(account)}</dd></div>
        </dl>
      {/if}
    </div>
    <section id="profilePanel" class="profile-panel">
      <div class="panel-head"><div><h3>{$t("profileTitle")}</h3><p>{$t("profileSub")}</p></div></div>
      <div id="profileIdentity" class="profile-identity">{account?.displayName || account?.id || ""}</div>
      <form id="profileForm" class="profile-form" onsubmit={saveProfile}>
        <div class="form-grid">
          <label class="field"><span>{$t("displayName")}</span><input id="profileDisplayNameInput" type="text" bind:value={profileName} /></label>
        </div>
        <div class="profile-actions">
          <button id="saveProfileBtn" class="primary-btn" type="submit">{$t("save")}</button>
          <p id="profileStatus" class="save-status" class:hidden={!profileStatus} role="status" aria-live="polite">{profileStatus}</p>
        </div>
      </form>
    </section>
    {#if !isGoogleAccount}
      <form id="accountSecurityForm" class="account-security-form" onsubmit={changePassword}>
        <div class="form-grid">
          <label class="field"><span>{$t("currentPassword")}</span><input id="currentPasswordInput" type="password" bind:value={curPw} /></label>
          <label class="field"><span>{$t("newPassword")}</span><input id="changePasswordInput" type="password" bind:value={newPw} /></label>
          <label class="field"><span>{$t("confirmNewPassword")}</span><input id="confirmPasswordInput" type="password" bind:value={confirmPw} /></label>
        </div>
        <div class="account-security-actions">
          <button id="changePasswordBtn" class="primary-btn" type="submit">{$t("changePassword")}</button>
          <p id="accountSecurityStatus" class="save-status" class:hidden={!securityStatus} role="status" aria-live="polite">{securityStatus}</p>
        </div>
      </form>
    {/if}
  </section>

  <!-- ADMIN: create account + managed list -->
  <section id="accountAdminPanel" class="panel account-admin-panel" data-settings-panel data-settings-section="admin" class:settings-section-hidden={hidden("admin")}>
    <div class="panel-head"><div><h3>{$t("accountAdminTitle")}</h3><p>{$t("accountAdminSub")}</p></div></div>
    <form id="accountAdminForm" class="account-admin-form" onsubmit={createAccount}>
      <div class="form-grid">
        <label class="field"><span>{$t("accountId")}</span><input id="newAccountIdInput" type="text" bind:value={acctId} /></label>
        <label class="field"><span>{$t("displayName")}</span><input id="newAccountDisplayNameInput" type="text" bind:value={acctName} /></label>
        <label class="field"><span>{$t("emailOptional")}</span><input id="newAccountEmailInput" type="email" bind:value={acctEmail} /></label>
        <label class="field"><span>{$t("workspaceName")}</span><input id="newAccountWorkspaceInput" type="text" bind:value={acctWorkspace} /></label>
        <label class="field"><span>{$t("temporaryPassword")}</span><input id="newAccountPasswordInput" type="password" bind:value={acctPw} /></label>
      </div>
      <div class="account-admin-actions">
        <button id="createAccountBtn" class="primary-btn" type="submit">{$t("createAccount")}</button>
        <p id="accountAdminStatus" class="save-status" class:hidden={!adminStatus} role="status" aria-live="polite">{adminStatus}</p>
      </div>
      <div id="accountAdminResult" class="account-admin-result" class:hidden={!adminResult} aria-live="polite">
        {#if adminResult}
          <strong>{adminResult.account?.displayName || adminResult.account?.id || "-"}</strong>
          <dl>
            <div><dt>{$t("accountId")}</dt><dd>{adminResult.account?.id || "-"}</dd></div>
            <div><dt>{$t("workspaceName")}</dt><dd>{adminResult.workspace?.name || adminResult.workspace?.id || "-"}</dd></div>
          </dl>
        {/if}
      </div>
    </form>
    <div class="managed-account-section">
      <div><h4>{$t("managedUsersTitle")}</h4><p>{$t("managedUsersSub")}</p></div>
      <div id="managedAccountsList" class="managed-account-list" aria-live="polite">
        {#if managedAccounts.length === 0}
          <p class="empty-state">{$t("managedUsersEmpty")}</p>
        {:else}
          {#each managedAccounts as a (a.id)}
            <article class="managed-account-item" data-managed-account-id={a.id}>
              <div class="managed-account-main">
                <strong>{a.displayName || a.id}</strong><span>{a.email || a.id}</span><small>{a.authProvider || "password"}</small>
              </div>
              <div class="managed-account-status">
                <span class="status-pill {a.accountStatus === 'trial' ? 'status-pill--warning' : 'status-pill--ok'}">{statusLabel(a)}</span>
                {#if a.accountStatus === "trial"}
                  <button class="ghost-btn promote-account-btn" type="button" data-promote-account={a.id} onclick={() => promote(a.id!, a.displayName || a.id!)}>{$t("promoteToStandard")}</button>
                {:else}
                  <span class="managed-account-note">{$t("noActionNeeded")}</span>
                {/if}
                <button class="danger-btn delete-account-btn" type="button" data-delete-account={a.id} onclick={() => removeAccount(a.id!, a.displayName || a.email || a.id!)}>{$t("deleteAccount")}</button>
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </div>
  </section>

  <!-- ADMIN: password reset -->
  <section id="accountResetPanel" class="panel account-reset-panel" data-settings-panel data-settings-section="admin" class:settings-section-hidden={hidden("admin")}>
    <div class="panel-head"><div><h3>{$t("accountResetTitle")}</h3><p>{$t("accountResetSub")}</p></div></div>
    <form id="accountResetForm" class="account-reset-form" onsubmit={resetAccountPassword}>
      <div class="form-grid">
        <label class="field">
          <span>{$t("accountToReset")}</span>
          <select id="resetAccountSelect" bind:value={resetSel}>
            {#each resettable as a (a.id)}<option value={a.id}>{a.displayName || a.id} ({a.id})</option>{/each}
          </select>
        </label>
        <label class="field"><span>{$t("newTemporaryPassword")}</span><input id="resetAccountPasswordInput" type="password" bind:value={resetPw} /></label>
        <label class="field"><span>{$t("confirmTemporaryPassword")}</span><input id="resetAccountConfirmInput" type="password" bind:value={resetConfirm} /></label>
      </div>
      <div class="account-reset-actions">
        <button id="resetAccountPasswordBtn" class="primary-btn" type="submit" disabled={resettable.length === 0}>{$t("resetAccountPassword")}</button>
        <p id="accountResetStatus" class="save-status" class:hidden={!resetStatus} role="status" aria-live="polite">{resetStatus}</p>
      </div>
    </form>
  </section>
</section>
