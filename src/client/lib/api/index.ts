import { apiFetch } from "./client";
import type {
  AppMeta,
  SessionInfo,
  GoogleAuthStatus,
  AccountState,
  AdminAccount,
} from "$lib/types/api";
import type { BudgetState } from "$shared/types";

export { ApiError } from "./client";

// --- meta / auth status ---
export async function fetchMeta(): Promise<AppMeta> {
  return (await apiFetch<AppMeta>("/api/meta")).data;
}

export async function fetchSession(): Promise<SessionInfo> {
  return (await apiFetch<SessionInfo>("/api/session")).data;
}

export async function fetchGoogleAuthStatus(): Promise<GoogleAuthStatus> {
  return (await apiFetch<GoogleAuthStatus>("/api/auth/google/status")).data;
}

// --- account / me ---
export async function fetchMe(): Promise<{ status: number; data: AccountState | null }> {
  const res = await apiFetch<AccountState>("/api/me", { throwOnError: false });
  return { status: res.status, data: res.ok ? res.data : null };
}

export async function fetchAdminAccounts(): Promise<AdminAccount[]> {
  const res = await apiFetch<{ accounts?: AdminAccount[] }>("/api/admin/accounts", { throwOnError: false });
  return res.ok && Array.isArray(res.data.accounts) ? res.data.accounts : [];
}

// --- budget state ---
export async function fetchState(): Promise<{ status: number; data: BudgetState | null }> {
  const res = await apiFetch<BudgetState>("/api/state", { throwOnError: false });
  return { status: res.status, data: res.ok ? res.data : null };
}

export async function postState(state: BudgetState): Promise<void> {
  await apiFetch("/api/state", { method: "POST", body: state });
}

export async function resetState(): Promise<BudgetState> {
  return (await apiFetch<BudgetState>("/api/reset", { method: "POST" })).data;
}

// --- session lifecycle ---
export async function login(payload: { password: string; accountId?: string }): Promise<{ ok: boolean; status: number }> {
  const res = await apiFetch("/api/session", { method: "POST", body: payload, throwOnError: false });
  return { ok: res.ok, status: res.status };
}

export async function logout(): Promise<void> {
  await apiFetch("/api/session", { method: "DELETE", throwOnError: false });
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  await apiFetch("/api/session/workspace", { method: "POST", body: { workspaceId } });
}

// --- workspaces ---
export async function createWorkspace(name: string): Promise<unknown> {
  return (await apiFetch("/api/workspaces", { method: "POST", body: { name } })).data;
}

export async function renameWorkspace(id: string, name: string): Promise<unknown> {
  return (await apiFetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } })).data;
}

export async function deleteWorkspace(id: string): Promise<unknown> {
  return (await apiFetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" })).data;
}

// --- profile / password (self) ---
export async function updateProfile(displayName: string): Promise<unknown> {
  return (await apiFetch("/api/me/profile", { method: "PATCH", body: { displayName } })).data;
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}): Promise<unknown> {
  return (await apiFetch("/api/me/password", { method: "PATCH", body: payload })).data;
}

// --- admin ---
export async function createAccount(payload: {
  accountId?: string;
  displayName?: string;
  email?: string;
  password: string;
  workspaceName?: string;
}): Promise<unknown> {
  return (await apiFetch("/api/admin/accounts", { method: "POST", body: payload })).data;
}

export async function deleteAccount(id: string): Promise<unknown> {
  return (await apiFetch(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: "DELETE" })).data;
}

export async function setAccountStatus(id: string, accountStatus: string): Promise<unknown> {
  return (
    await apiFetch(`/api/admin/accounts/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { accountStatus },
    })
  ).data;
}

export async function resetAccountPassword(
  id: string,
  payload: { newPassword: string; confirmPassword?: string },
): Promise<unknown> {
  return (
    await apiFetch(`/api/admin/accounts/${encodeURIComponent(id)}/password`, {
      method: "PATCH",
      body: payload,
    })
  ).data;
}
