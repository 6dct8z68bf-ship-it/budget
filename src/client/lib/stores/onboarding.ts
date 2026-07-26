// Guided intro tour, ported from app.js (2750-3033). The Onboarding.svelte component
// renders the overlay/spotlight/confetti; this store owns step state + navigation.
import { writable, get } from "svelte/store";
import { authState, accountState } from "$lib/stores/auth";
import { currentView, switchView, type ViewName, type SettingsSection } from "$lib/stores/router";
import { translate } from "$lib/i18n";
import { getLanguage } from "$lib/stores/i18n";

const ONBOARDING_STORAGE_PREFIX = "family-budget-onboarding-v1";
const ONBOARDING_VERSION = "2026-07";

export interface OnboardingStep {
  layout: "welcome" | "content" | "finish";
  titleKey: string;
  titleArg?: string;
  bodyKey: string;
  view: ViewName;
  settingsSection?: SettingsSection;
  selector: string | null;
}

export interface OnboardingState {
  active: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
}

export const onboarding = writable<OnboardingState>({ active: false, stepIndex: 0, steps: [] });

function storageKey(): string {
  const account = get(accountState);
  const accountId = account?.account?.id || account?.user?.id || "guest";
  return `${ONBOARDING_STORAGE_PREFIX}:${ONBOARDING_VERSION}:${accountId}`;
}

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(storageKey()) === "completed";
  } catch {
    return false;
  }
}

function setOnboardingCompleted(completed: boolean): void {
  try {
    if (completed) localStorage.setItem(storageKey(), "completed");
    else localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
}

function displayName(): string {
  const account = get(accountState);
  return account?.account?.displayName || account?.user?.displayName || translate(getLanguage(), "titleUserFallback");
}

function buildSteps(): OnboardingStep[] {
  const initialView = get(currentView);
  const name = displayName();
  return [
    { layout: "welcome", titleKey: "guidedIntroWelcomeTitle", titleArg: name, bodyKey: "guidedIntroWelcomeBody", view: initialView, selector: null },
    { layout: "content", titleKey: "guidedIntroMonthMenuTitle", bodyKey: "guidedIntroMonthMenuBody", view: "overview", selector: "#monthActionsMenu" },
    { layout: "content", titleKey: "guidedIntroStep3Title", bodyKey: "guidedIntroStep3Body", view: "settings", settingsSection: "data", selector: "#monthDataPanel" },
    { layout: "content", titleKey: "guidedIntroImportTitle", bodyKey: "guidedIntroImportBody", view: "overview", selector: "#overviewImportPanel" },
    { layout: "content", titleKey: "guidedIntroStep5Title", bodyKey: "guidedIntroStep5Body", view: "overview", selector: ".overview-decision" },
    { layout: "content", titleKey: "guidedIntroStep6Title", bodyKey: "guidedIntroStep6Body", view: "overview", selector: "#monthlyTrendPanel" },
    { layout: "finish", titleKey: "guidedIntroFinishTitle", bodyKey: "guidedIntroFinishBody", view: "overview", selector: null },
  ];
}

export function goToOnboardingStep(index: number): void {
  const state = get(onboarding);
  if (!state.active) return;
  const clamped = Math.max(0, Math.min(index, state.steps.length - 1));
  const step = state.steps[clamped];
  if (step?.view) {
    switchView(step.view, { history: "none", settingsSection: step.settingsSection });
  }
  onboarding.update((s) => ({ ...s, stepIndex: clamped }));
}

export function startOnboarding({ force = false }: { force?: boolean } = {}): void {
  if (!get(authState).authenticated) return;
  if (!force && hasCompletedOnboarding()) return;
  onboarding.set({ active: true, stepIndex: 0, steps: buildSteps() });
  goToOnboardingStep(0);
}

export function stopOnboarding({ completed = false }: { completed?: boolean } = {}): void {
  if (completed) setOnboardingCompleted(true);
  onboarding.set({ active: false, stepIndex: 0, steps: [] });
  if (typeof document !== "undefined") document.body.classList.remove("onboarding-open");
}

export function nextOnboardingStep(): void {
  const state = get(onboarding);
  if (state.stepIndex >= state.steps.length - 1) {
    stopOnboarding({ completed: true });
    return;
  }
  goToOnboardingStep(state.stepIndex + 1);
}

export function prevOnboardingStep(): void {
  goToOnboardingStep(get(onboarding).stepIndex - 1);
}

export function maybeStartOnboarding(): void {
  if (!get(authState).authenticated || hasCompletedOnboarding()) return;
  startOnboarding();
}
