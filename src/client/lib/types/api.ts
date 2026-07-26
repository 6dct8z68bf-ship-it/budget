// Response/request shapes for the Node API (src/server/server.js). The server does no
// schema validation, so these describe the observed round-trip contract.

export interface AppMeta {
  buildVersion: string;
  buildTime: string;
  authEnabled: boolean;
  contactEmail: string;
}

export const META_FALLBACK: AppMeta = {
  buildVersion: "",
  buildTime: "",
  authEnabled: false,
  contactEmail: "",
};

export interface SessionInfo {
  authenticated: boolean;
  authEnabled: boolean;
  accountId?: string | null;
  user?: PublicUser | null;
  workspaceId?: string | null;
}

export interface AuthState {
  authEnabled: boolean;
  authenticated: boolean;
  resolved: boolean;
}

export interface GoogleAuthStatus {
  ok?: boolean;
  provider?: string;
  enabled: boolean;
  configured: boolean;
  clientIdConfigured?: boolean;
  redirectUri?: string;
  loginUrl: string;
}

export interface PublicUser {
  id?: string;
  displayName?: string;
  email?: string;
  [key: string]: unknown;
}

export interface Account {
  id?: string;
  displayName?: string;
  email?: string;
  accountStatus?: string;
  isDefaultUser?: boolean;
  [key: string]: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  role?: string;
}

export interface AccountState {
  user: PublicUser | null;
  account: Account | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
}

export interface AdminAccount extends PublicUser {
  accountStatus?: string;
}
