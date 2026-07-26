import { writable, derived, get } from "svelte/store";
import type {
  AppMeta,
  AuthState,
  GoogleAuthStatus,
  AccountState,
  AdminAccount,
} from "$lib/types/api";
import { META_FALLBACK } from "$lib/types/api";

export const APP_ROUTE_PREFIX = "/app";

export const appMeta = writable<AppMeta>(META_FALLBACK);
export const authState = writable<AuthState>({ authEnabled: true, authenticated: false, resolved: false });
export const googleAuthState = writable<GoogleAuthStatus>({
  enabled: false,
  configured: false,
  loginUrl: "/auth/google/start?returnTo=%2Fapp",
});
export const accountState = writable<AccountState | null>(null);
export const adminAccounts = writable<AdminAccount[]>([]);
// Authentication can resolve before account and budget data finish loading.
// Keep those phases separate so the protected UI is never interactive midway
// through bootstrap.
export const appDataReady = writable(false);

// isAuthLocked() from app.js:2564
export const isAuthLocked = derived(authState, ($a) => !$a.resolved || ($a.authEnabled && !$a.authenticated));

// updateAuthUi() booleans from app.js:3058-3062
export const isCheckingAuth = derived(
  [authState, appDataReady],
  ([$a, $ready]) => !$a.resolved || ((!$a.authEnabled || $a.authenticated) && !$ready),
);
export const shouldShowOverlay = derived(
  [isCheckingAuth, isAuthLocked],
  ([$checking, $locked]) => $checking || $locked,
);
export const shouldShowLogin = derived(
  [shouldShowOverlay, isCheckingAuth],
  ([$overlay, $checking]) => $overlay && !$checking,
);
export const googleReady = derived(googleAuthState, ($g) => !!($g.enabled && $g.configured));

export function authLockedNow(): boolean {
  return get(isAuthLocked);
}

function currentAppReturnTo(): string {
  if (typeof window === "undefined") return APP_ROUTE_PREFIX;
  const path = window.location.pathname.startsWith(APP_ROUTE_PREFIX)
    ? window.location.pathname
    : APP_ROUTE_PREFIX;
  return `${path}${window.location.search || ""}`;
}

export function buildGoogleLoginUrl(): string {
  const fallback = `/auth/google/start?returnTo=${encodeURIComponent(currentAppReturnTo())}`;
  try {
    const url = new URL(get(googleAuthState).loginUrl || fallback, window.location.origin);
    url.searchParams.set("returnTo", currentAppReturnTo());
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
