// Boot sequence + auth gate, ported from bootstrapApp/handleLogin/logout in app.js.
// The gate order is load-bearing: never fetch /api/state until the session is resolved
// AND (auth disabled OR authenticated). This is what the reverted React attempt broke.
import { get } from "svelte/store";
import * as api from "$lib/api";
import { META_FALLBACK } from "$lib/types/api";
import {
  appMeta,
  authState,
  googleAuthState,
  accountState,
  adminAccounts,
  appDataReady,
} from "$lib/stores/auth";
import { setBudgetState } from "$lib/stores/budget";
import { parseRoute, currentView, currentSettingsSection, applyRouteFromLocation } from "$lib/stores/router";
import { maybeStartOnboarding, stopOnboarding } from "$lib/stores/onboarding";

async function loadMeta(): Promise<void> {
  try {
    appMeta.set({ ...META_FALLBACK, ...(await api.fetchMeta()) });
  } catch {
    appMeta.set(META_FALLBACK);
  }
}

async function loadSession(): Promise<void> {
  try {
    authState.set({ ...(await api.fetchSession()), resolved: true } as never);
  } catch {
    authState.set({ authEnabled: true, authenticated: false, resolved: true });
  }
}

async function loadGoogleAuthStatus(): Promise<void> {
  try {
    googleAuthState.set(await api.fetchGoogleAuthStatus());
  } catch {
    googleAuthState.set({ enabled: false, configured: false, loginUrl: "/auth/google/start?returnTo=%2Fapp" });
  }
}

export async function loadAccountState(): Promise<void> {
  const auth = get(authState);
  if (auth.authEnabled && !auth.authenticated) {
    accountState.set(null);
    adminAccounts.set([]);
    return;
  }
  try {
    const { status, data } = await api.fetchMe();
    if (status === 401) {
      accountState.set(null);
      adminAccounts.set([]);
      authState.update((a) => ({ ...a, authenticated: false, resolved: true }));
      return;
    }
    accountState.set(data);
    if (data?.account?.isDefaultUser === true) {
      adminAccounts.set(await api.fetchAdminAccounts());
    } else {
      adminAccounts.set([]);
    }
  } catch {
    accountState.set(null);
    adminAccounts.set([]);
  }
}

export async function loadBudgetState(): Promise<void> {
  try {
    const { status, data } = await api.fetchState();
    if (status === 401) {
      authState.update((a) => ({ ...a, authenticated: false, resolved: true }));
      return;
    }
    setBudgetState(data);
  } catch {
    setBudgetState(undefined);
  }
}

export async function bootstrap(): Promise<void> {
  appDataReady.set(false);
  await loadMeta();
  await loadSession();
  await loadGoogleAuthStatus();
  // Set the initial view from the URL before the gate so a deep link (e.g.
  // /app/settings/security) is retained and restored after login.
  const initialRoute = parseRoute();
  currentView.set(initialRoute.view);
  currentSettingsSection.set(initialRoute.settingsSection);
  const auth = get(authState);
  if (auth.authEnabled && !auth.authenticated) return; // auth gate
  await loadAccountState();
  await loadBudgetState();
  applyRouteFromLocation({ history: "replace" });
  appDataReady.set(true);
  maybeStartOnboarding();
}

export async function doLogin(payload: { password: string; accountId?: string }): Promise<boolean> {
  const { ok } = await api.login(payload);
  if (!ok) return false;
  appDataReady.set(false);
  authState.set({ authEnabled: true, authenticated: true, resolved: true });
  await loadAccountState();
  await loadBudgetState();
  applyRouteFromLocation({ history: "replace" });
  appDataReady.set(true);
  maybeStartOnboarding();
  return true;
}

export async function doLogout(): Promise<void> {
  stopOnboarding({ completed: false });
  appDataReady.set(false);
  authState.update((a) => ({ ...a, authenticated: false, resolved: true }));
  accountState.set(null);
  adminAccounts.set([]);
  try {
    await api.logout();
  } catch {
    /* ignore */
  }
}
