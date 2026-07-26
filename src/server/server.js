const http = require("http");
const https = require("https");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, "..", "..");
const PUBLIC_ROOT = process.env.PUBLIC_ROOT || path.join(ROOT, "src", "public");
// Seed/example budget document shared with the client (src/shared/budget-data.json).
// Kept as plain JSON so the server can read it directly instead of eval'ing a browser
// script; the Svelte client imports the same file. Override with SHARED_DATA_PATH.
const SHARED_DATA_PATH =
  process.env.SHARED_DATA_PATH || path.join(ROOT, "src", "shared", "budget-data.json");
const STORE_PATH = process.env.STORE_PATH || path.join(ROOT, "budget-store.json");
const WORKSPACE_STORE_ROOT = process.env.WORKSPACE_STORE_ROOT || "";
const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID || "default";
const ACCOUNT_REGISTRY_PATH =
  process.env.ACCOUNT_REGISTRY_PATH ||
  path.join(WORKSPACE_STORE_ROOT || path.dirname(STORE_PATH), "account-registry.json");
const SESSION_REGISTRY_PATH =
  process.env.SESSION_REGISTRY_PATH ||
  path.join(WORKSPACE_STORE_ROOT || path.dirname(STORE_PATH), "session-registry.json");
const OAUTH_STATE_REGISTRY_PATH =
  process.env.OAUTH_STATE_REGISTRY_PATH ||
  path.join(WORKSPACE_STORE_ROOT || path.dirname(STORE_PATH), "oauth-state-registry.json");
const WORKSPACE_REGISTRY_SEED_IDS = (process.env.WORKSPACE_REGISTRY_SEED_IDS || "")
  .split(",")
  .map((workspaceId) => workspaceId.trim())
  .filter(Boolean);
const WORKSPACE_REGISTRY_UNOWNED_SEED_IDS = (process.env.WORKSPACE_REGISTRY_UNOWNED_SEED_IDS || "")
  .split(",")
  .map((workspaceId) => workspaceId.trim())
  .filter(Boolean);
const DEFAULT_WORKSPACE_NAME = "My Budget";
const LEGACY_GENERIC_DEFAULT_WORKSPACE_NAMES = new Set(["Default Workspace", "Default workspace"]);
const ACCOUNT_REGISTRY_SCHEMA_VERSION = 1;
const SESSION_REGISTRY_SCHEMA_VERSION = 1;
const OAUTH_STATE_REGISTRY_SCHEMA_VERSION = 1;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || "default-owner";
const DEFAULT_ACCOUNT_DISPLAY_NAME = process.env.DEFAULT_ACCOUNT_DISPLAY_NAME || "Default Owner";
const DEFAULT_ACCOUNT_EMAIL = process.env.DEFAULT_ACCOUNT_EMAIL || "";
const DEFAULT_AUTH_PROVIDER = process.env.DEFAULT_AUTH_PROVIDER || "password";
const DEFAULT_AUTH_SUBJECT = process.env.DEFAULT_AUTH_SUBJECT || DEFAULT_ACCOUNT_ID;
const DEFAULT_ACCOUNT_PASSWORD = process.env.DEFAULT_ACCOUNT_PASSWORD || "";
const DEFAULT_ACCOUNT_PASSWORD_HASH = process.env.DEFAULT_ACCOUNT_PASSWORD_HASH || "";
const FALLBACK_ACCOUNT_ID = "default-owner";
const FALLBACK_ACCOUNT_DISPLAY_NAME = "Default Owner";
const FALLBACK_AUTH_PROVIDER = "password";
const DEFAULT_PORT = 5173;
const DEFAULT_HTTPS_PORT = 5443;
const AUTH_COOKIE = "family_budget_session";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const GOOGLE_OAUTH_ENABLED = process.env.GOOGLE_OAUTH_ENABLED === "true";
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT =
  process.env.GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT || "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_ENDPOINT = process.env.GOOGLE_OAUTH_TOKEN_ENDPOINT || "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_USERINFO_ENDPOINT =
  process.env.GOOGLE_OAUTH_USERINFO_ENDPOINT || "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_OAUTH_JWKS_ENDPOINT =
  process.env.GOOGLE_OAUTH_JWKS_ENDPOINT || "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_OAUTH_REDIRECT_PATH = process.env.GOOGLE_OAUTH_REDIRECT_PATH || "/auth/google/callback";
const GOOGLE_OAUTH_APP_BASE_URL = process.env.GOOGLE_OAUTH_APP_BASE_URL || process.env.APP_BASE_URL || "";
const GOOGLE_OAUTH_ALLOWED_DOMAIN = process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN || "";
const GOOGLE_OAUTH_STATE_TTL_SECONDS = Math.max(60, Number(process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS || 10 * 60) || 10 * 60);
const GOOGLE_OAUTH_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.GOOGLE_OAUTH_REQUEST_TIMEOUT_MS || 10000) || 10000,
);
const GOOGLE_OAUTH_MOCK_ENABLED = process.env.GOOGLE_OAUTH_MOCK_ENABLED === "true";
const BUILD_VERSION = process.env.APP_BUILD_VERSION || "";
const BUILD_TIME = process.env.APP_BUILD_TIME || new Date().toISOString();
const CONTACT_EMAIL = process.env.APP_CONTACT_EMAIL || "";
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "";
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "";
const REDIRECT_HTTP_TO_HTTPS = process.env.REDIRECT_HTTP_TO_HTTPS === "true";
const SECURE_SESSION_COOKIE =
  process.env.SECURE_SESSION_COOKIE === "true" || REDIRECT_HTTP_TO_HTTPS || !!(SSL_CERT_PATH && SSL_KEY_PATH);
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 14);
const LOGIN_RATE_LIMIT_WINDOW_MS = Math.max(
  60_000,
  Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000) || 15 * 60 * 1000,
);
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 10) || 10,
);
const E2E_TEST_MODE = process.env.E2E_TEST_MODE === "true";
const E2E_RESET_TOKEN = process.env.E2E_RESET_TOKEN || "";
const DEFAULT_CATEGORY_SETTINGS = {
  version: 1,
  customCategories: [],
  archivedCategoryKeys: [],
  labelOverrides: {},
  hintOverrides: {},
};
const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_HASH_KEY_LENGTH = 64;
const sessions = new Map();
const oauthStates = new Map();
const loginFailures = new Map();
const storageWriteQueues = new Map();
let googleJwksCache = null;
let sessionRegistryWriteQueue = Promise.resolve();
let oauthStateRegistryWriteQueue = Promise.resolve();
let activeStorageWriteCount = 0;
let storageBackupRecoveryCount = 0;
let lastStorageBackupRecoveryAt = null;
let storageWriteFailureCount = 0;

class StorePathError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorePathError";
  }
}

class AccountRegistryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AccountRegistryError";
    this.status = status;
  }
}

class StorageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageValidationError";
    this.status = 400;
  }
}

const storageBackupSuffix = ".bak";

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function writeJsonFileNow(filePath, value, { preserveBackup = false } = {}) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const backupPath = `${filePath}${storageBackupSuffix}`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  await fs.mkdir(directory, { recursive: true });
  try {
    if (!preserveBackup && fsSync.existsSync(filePath)) {
      await fs.copyFile(filePath, backupPath);
    }
    await fs.writeFile(tempPath, serialized, "utf8");
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Windows cannot replace an existing file with rename; this fallback keeps
      // local development working while production still gets an atomic rename.
      if (!["EEXIST", "EPERM"].includes(error.code)) throw error;
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
    }
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

function queueStorageWrite(filePath, operation) {
  const previous = storageWriteQueues.get(filePath) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  storageWriteQueues.set(filePath, next);
  return next.finally(() => {
    if (storageWriteQueues.get(filePath) === next) storageWriteQueues.delete(filePath);
  });
}

async function writeJsonFile(filePath, value, options = {}) {
  return queueStorageWrite(filePath, async () => {
    activeStorageWriteCount += 1;
    try {
      return await writeJsonFileNow(filePath, value, options);
    } catch (error) {
      storageWriteFailureCount += 1;
      throw error;
    } finally {
      activeStorageWriteCount -= 1;
    }
  });
}

async function readJsonFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const backupPath = `${filePath}${storageBackupSuffix}`;
      const backupText = await fs.readFile(backupPath, "utf8");
      const recovered = JSON.parse(backupText);
      storageBackupRecoveryCount += 1;
      lastStorageBackupRecoveryAt = nowIso();
      await writeJsonFile(filePath, recovered, { preserveBackup: true });
      return recovered;
    }
  } catch (error) {
    throw error;
  }
}

function validateBudgetState(state) {
  if (!isPlainObject(state) || !isPlainObject(state.months) || typeof state.currentMonthId !== "string") {
    throw new StorageValidationError("Budget state must include currentMonthId and months.");
  }
  const monthIds = Object.keys(state.months);
  if (monthIds.length === 0 || !state.months[state.currentMonthId]) {
    throw new StorageValidationError("Budget state must contain a valid current month.");
  }
  for (const [monthId, month] of Object.entries(state.months)) {
    if (!isPlainObject(month) || !Array.isArray(month.weeks)) {
      throw new StorageValidationError(`Month ${monthId} has an invalid weeks collection.`);
    }
  }
  return state;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function sendJson(res, status, value, headers = {}) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendText(res, status, value, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(value);
}

function publicOrigin(req) {
  if (GOOGLE_OAUTH_APP_BASE_URL) return GOOGLE_OAUTH_APP_BASE_URL.replace(/\/+$/, "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
  return `${protocol}://${req.headers.host || "localhost"}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sendPublicDiscoveryFile(req, res, pathname) {
  const origin = publicOrigin(req);
  if (pathname === "/robots.txt") {
    sendText(res, 200, `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /auth\nDisallow: /api\nSitemap: ${origin}/sitemap.xml\n`);
    return true;
  }
  if (pathname === "/sitemap.xml") {
    const urls = ["/", "/about", "/guide", "/faq", "/contact", "/privacy", "/terms"]
      .map((route) => `  <url><loc>${xmlEscape(`${origin}${route}`)}</loc></url>`)
      .join("\n");
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    sendText(res, 200, body, { "content-type": "application/xml; charset=utf-8" });
    return true;
  }
  return false;
}

function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers);
  res.end();
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const key = crypto.scryptSync(String(password || ""), salt, PASSWORD_HASH_KEY_LENGTH).toString("hex");
  return `${PASSWORD_HASH_ALGORITHM}$${salt}$${key}`;
}

function isSupportedPasswordHash(storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 3) return false;
  const [algorithm, salt, expectedKey] = parts;
  return (
    algorithm === PASSWORD_HASH_ALGORITHM &&
    !!salt &&
    /^[a-fA-F0-9]+$/.test(expectedKey || "") &&
    Buffer.from(expectedKey, "hex").length > 0
  );
}

function verifyPassword(password, storedHash) {
  if (!isSupportedPasswordHash(storedHash)) return false;
  const [algorithm, salt, expectedKey] = String(storedHash || "").split("$");
  const actual = crypto.scryptSync(String(password || ""), salt, Buffer.from(expectedKey, "hex").length);
  const expected = Buffer.from(expectedKey, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeWorkspaceId(workspaceId) {
  const value = String(workspaceId || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new StorePathError("Workspace id contains unsupported characters.");
  }
  return value;
}

function normalizeAccountId(accountId) {
  const value = String(accountId || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new AccountRegistryError("Account id contains unsupported characters.", 400);
  }
  return value;
}

function normalizeWorkspaceName(name) {
  const value = String(name || "").trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 80) {
    throw new AccountRegistryError("Workspace name must be between 2 and 80 characters.", 400);
  }
  return value;
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return null;
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AccountRegistryError("Email must be a valid address.", 400);
  }
  return value;
}

function normalizePassword(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 256) {
    throw new AccountRegistryError("Password must be between 8 and 256 characters.", 400);
  }
  return value;
}

function workspaceSlugFromName(name) {
  const slug = normalizeWorkspaceName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "workspace";
}

function workspaceStoreRootDir() {
  return path.resolve(WORKSPACE_STORE_ROOT || path.join(path.dirname(STORE_PATH), "workspace-stores"));
}

function accountSlugFromSeed(seed) {
  const slug = String(seed || "")
    .trim()
    .toLowerCase()
    .replace(/@.*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "account";
}

function emptyAccountRegistry() {
  return {
    version: ACCOUNT_REGISTRY_SCHEMA_VERSION,
    accounts: {},
    workspaces: {},
    memberships: [],
  };
}

function registeredWorkspace(workspaceId, name = workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  return {
    id,
    name,
    createdAt: nowIso(),
  };
}

function registeredAccount(accountId, displayName = accountId) {
  const id = normalizeWorkspaceId(accountId);
  const now = nowIso();
  return {
    id,
    userId: id,
    displayName,
    email: id === DEFAULT_ACCOUNT_ID ? DEFAULT_ACCOUNT_EMAIL || null : null,
    authProvider: DEFAULT_AUTH_PROVIDER,
    authSubject: id === DEFAULT_ACCOUNT_ID ? DEFAULT_AUTH_SUBJECT : id,
    accountStatus: "standard",
    trialStartedAt: null,
    trialSource: null,
    isDefaultUser: id === DEFAULT_ACCOUNT_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function configuredFirstOwnerIdentity() {
  return {
    id: DEFAULT_ACCOUNT_ID,
    displayName: DEFAULT_ACCOUNT_DISPLAY_NAME,
    email: DEFAULT_ACCOUNT_EMAIL || null,
    authProvider: DEFAULT_AUTH_PROVIDER,
    authSubject: DEFAULT_AUTH_SUBJECT,
    passwordHash: DEFAULT_ACCOUNT_PASSWORD_HASH || (DEFAULT_ACCOUNT_PASSWORD ? hashPassword(DEFAULT_ACCOUNT_PASSWORD) : null),
    accountStatus: "standard",
  };
}

function normalizeAccountRecord(account, accountId) {
  const id = normalizeWorkspaceId(account?.id || accountId);
  const provider = account?.authProvider || DEFAULT_AUTH_PROVIDER;
  const now = nowIso();
  const accountStatus = account?.accountStatus === "active" ? "standard" : account?.accountStatus || "standard";
  return {
    ...account,
    id,
    userId: account?.userId || id,
    displayName: account?.displayName || id,
    email: account?.email || null,
    authProvider: provider,
    authSubject: account?.authSubject || (id === DEFAULT_ACCOUNT_ID ? DEFAULT_AUTH_SUBJECT : id),
    passwordHash: account?.passwordHash || null,
    accountStatus,
    trialStartedAt: account?.trialStartedAt || null,
    trialSource: account?.trialSource || null,
    isDefaultUser: account?.isDefaultUser ?? id === DEFAULT_ACCOUNT_ID,
    createdAt: account?.createdAt || now,
    updatedAt: account?.updatedAt || now,
  };
}

function ensureAccountRecord(registry, accountId, displayName = accountId) {
  const id = normalizeWorkspaceId(accountId);
  if (!registry.accounts[id]) {
    registry.accounts[id] = registeredAccount(id, displayName);
  } else {
    registry.accounts[id] = normalizeAccountRecord(registry.accounts[id], id);
  }
  return registry.accounts[id];
}

function ensureFirstOwnerBootstrapRecord(registry) {
  const identity = configuredFirstOwnerIdentity();
  const account = ensureAccountRecord(registry, identity.id, identity.displayName);
  const updates = {};
  if (!account.userId) updates.userId = identity.id;
  if (!account.displayName) updates.displayName = identity.displayName;
  if (!account.email && identity.email) updates.email = identity.email;
  if (!account.authProvider) updates.authProvider = identity.authProvider;
  if (!account.authSubject) updates.authSubject = identity.authSubject;
  if (identity.passwordHash && !isSupportedPasswordHash(account.passwordHash)) updates.passwordHash = identity.passwordHash;
  if (!account.accountStatus) updates.accountStatus = identity.accountStatus;
  if (account.isDefaultUser === undefined) updates.isDefaultUser = identity.id === FALLBACK_ACCOUNT_ID;
  if (!account.updatedAt) updates.updatedAt = nowIso();
  if (Object.keys(updates).length > 0) {
    registry.accounts[identity.id] = {
      ...account,
      ...updates,
    };
  }
  return registry.accounts[identity.id];
}

function ensureWorkspaceRecord(registry, workspaceId, name = workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  if (!registry.workspaces[id]) {
    registry.workspaces[id] = registeredWorkspace(id, name);
  }
  return registry.workspaces[id];
}

function migrateGenericDefaultWorkspaceName(registry) {
  const workspace = registry.workspaces[DEFAULT_WORKSPACE_ID];
  if (workspace && LEGACY_GENERIC_DEFAULT_WORKSPACE_NAMES.has(workspace.name)) {
    workspace.name = DEFAULT_WORKSPACE_NAME;
  }
}

function hasMembership(registry, accountId, workspaceId) {
  return registry.memberships.some(
    (membership) =>
      membership.accountId === accountId &&
      membership.workspaceId === workspaceId,
  );
}

function membershipRole(registry, accountId, workspaceId) {
  return registry.memberships.find(
    (membership) =>
      membership.accountId === accountId &&
      membership.workspaceId === workspaceId,
  )?.role || null;
}

function ensureMembershipRecord(registry, accountId, workspaceId, role = "owner") {
  if (!hasMembership(registry, accountId, workspaceId)) {
    registry.memberships.push({
      accountId,
      workspaceId,
      role,
      createdAt: nowIso(),
    });
  }
}

function ensureDefaultIdentity(registry) {
  const account = ensureFirstOwnerBootstrapRecord(registry);
  [DEFAULT_WORKSPACE_ID, ...WORKSPACE_REGISTRY_SEED_IDS].forEach((workspaceId) => {
    const workspace = ensureWorkspaceRecord(
      registry,
      workspaceId,
      workspaceId === DEFAULT_WORKSPACE_ID ? DEFAULT_WORKSPACE_NAME : workspaceId,
    );
    ensureMembershipRecord(registry, account.id, workspace.id, "owner");
  });
  migrateGenericDefaultWorkspaceName(registry);
}

function buildDefaultAccountRegistry() {
  const registry = emptyAccountRegistry();
  ensureDefaultIdentity(registry);
  WORKSPACE_REGISTRY_UNOWNED_SEED_IDS.forEach((workspaceId) => ensureWorkspaceRecord(registry, workspaceId));
  return registry;
}

async function readAccountRegistry() {
  try {
    const registry = await readJsonFile(ACCOUNT_REGISTRY_PATH);
    if (!isPlainObject(registry)) {
      throw new AccountRegistryError("Account registry must be a JSON object.", 500);
    }
    registry.version = registry.version || ACCOUNT_REGISTRY_SCHEMA_VERSION;
    if (registry.version > ACCOUNT_REGISTRY_SCHEMA_VERSION) {
      throw new AccountRegistryError("Account registry schema is newer than this server supports.", 500);
    }
    registry.accounts = registry.accounts || {};
    Object.entries(registry.accounts).forEach(([accountId, account]) => {
      registry.accounts[accountId] = normalizeAccountRecord(account, accountId);
    });
    registry.workspaces = registry.workspaces || {};
    registry.memberships = Array.isArray(registry.memberships) ? registry.memberships : [];
    return registry;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return buildDefaultAccountRegistry();
}

function registryHealthSummary(registry, session = null) {
  const defaultOwnerExists = !!registry.accounts[DEFAULT_ACCOUNT_ID];
  const defaultAccount = registry.accounts[DEFAULT_ACCOUNT_ID] || {};
  const defaultWorkspaceExists = !!registry.workspaces[DEFAULT_WORKSPACE_ID];
  const defaultMembershipExists = hasMembership(registry, DEFAULT_ACCOUNT_ID, DEFAULT_WORKSPACE_ID);
  const identityProviderCount = new Set(
    Object.values(registry.accounts)
      .map((account) => account.authProvider)
      .filter(Boolean),
  ).size;

  return {
    schemaVersion: registry.version,
    accountCount: Object.keys(registry.accounts).length,
    workspaceCount: Object.keys(registry.workspaces).length,
    membershipCount: registry.memberships.length,
    identityProviderCount,
    defaultOwnerExists,
    defaultUserIdentityReady: !!(
      defaultAccount.userId &&
      defaultAccount.displayName &&
      defaultAccount.authProvider &&
      defaultAccount.authSubject &&
      defaultAccount.createdAt &&
      defaultAccount.updatedAt
    ),
    defaultWorkspaceExists,
    defaultMembershipExists,
    workspaceStoreRootConfigured: !!WORKSPACE_STORE_ROOT,
    currentUserId: session?.accountId || null,
    currentWorkspaceId: session?.workspaceId || null,
  };
}

function firstOwnerBootstrapSummary(registry) {
  const account = registry.accounts[DEFAULT_ACCOUNT_ID] || {};
  return {
    accountId: DEFAULT_ACCOUNT_ID,
    configuredDisplayName: !!DEFAULT_ACCOUNT_DISPLAY_NAME,
    configuredEmail: !!DEFAULT_ACCOUNT_EMAIL,
    authProviderConfigured: !!DEFAULT_AUTH_PROVIDER,
    providerSubjectConfigured: !!DEFAULT_AUTH_SUBJECT,
    accountExists: !!account.id,
    emailPresent: !!account.email,
    providerSubjectPresent: !!account.authSubject,
    accountPasswordConfigured: isSupportedPasswordHash(account.passwordHash),
    accountPasswordBootstrapConfigured: isSupportedPasswordHash(DEFAULT_ACCOUNT_PASSWORD_HASH) || !!DEFAULT_ACCOUNT_PASSWORD,
    usingFallbackAccountId: DEFAULT_ACCOUNT_ID === FALLBACK_ACCOUNT_ID,
    usingFallbackDisplayName: (account.displayName || DEFAULT_ACCOUNT_DISPLAY_NAME) === FALLBACK_ACCOUNT_DISPLAY_NAME,
    usingFallbackAuthProvider: (account.authProvider || DEFAULT_AUTH_PROVIDER) === FALLBACK_AUTH_PROVIDER,
    migrationSafe: true,
  };
}

function authSummary(registry) {
  return {
    accountPasswordEnabled: isSupportedPasswordHash(registry.accounts[DEFAULT_ACCOUNT_ID]?.passwordHash),
    fallbackPasswordEnabled: !!APP_PASSWORD,
    sessionSecretConfigured: !!SESSION_SECRET,
  };
}

function normalizeGoogleOAuthRedirectPath() {
  const value = String(GOOGLE_OAUTH_REDIRECT_PATH || "/auth/google/callback").trim();
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("..")) {
    return "/auth/google/callback";
  }
  return value;
}

function googleOAuthConfigSummary() {
  const redirectPath = normalizeGoogleOAuthRedirectPath();
  const clientIdConfigured = !!GOOGLE_OAUTH_CLIENT_ID;
  const clientSecretConfigured = !!GOOGLE_OAUTH_CLIENT_SECRET;
  const appBaseUrlConfigured = !!GOOGLE_OAUTH_APP_BASE_URL;
  return {
    enabled: GOOGLE_OAUTH_ENABLED,
    configured: !!(GOOGLE_OAUTH_ENABLED && clientIdConfigured && clientSecretConfigured),
    clientIdConfigured,
    clientSecretConfigured,
    appBaseUrlConfigured,
    redirectPath,
    allowedDomainConfigured: !!GOOGLE_OAUTH_ALLOWED_DOMAIN,
    stateTtlSeconds: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    signupMode: "open-trial",
  };
}

function googleOAuthRedirectUri(req = null) {
  const redirectPath = normalizeGoogleOAuthRedirectPath();
  const configuredBaseUrl = GOOGLE_OAUTH_APP_BASE_URL.trim();
  if (configuredBaseUrl) {
    try {
      return new URL(redirectPath, configuredBaseUrl).toString();
    } catch {
      return null;
    }
  }
  if (!req) return null;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (SSL_CERT_PATH && SSL_KEY_PATH ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return null;
  try {
    return new URL(redirectPath, `${protocol}://${host}`).toString();
  } catch {
    return null;
  }
}

function googleOAuthReady() {
  return !!(GOOGLE_OAUTH_ENABLED && GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

function normalizeLocalReturnTo(value) {
  const fallback = "/app";
  const candidate = String(value || fallback).trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || candidate.includes("\n")) {
    return fallback;
  }
  if (candidate.startsWith("/auth/")) return fallback;
  return candidate || fallback;
}

function sendRedirect(res, location, cookie = null) {
  const headers = {
    location,
    "cache-control": "no-store",
  };
  if (cookie) headers["set-cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function validateGoogleProfile(profile) {
  const subject = String(profile?.sub || "").trim();
  const email = normalizeEmail(profile?.email);
  const emailVerified = profile?.email_verified === true || profile?.email_verified === "true";
  const displayName = normalizeWorkspaceName(profile?.name || email || "Google User");
  if (!subject) {
    throw new AccountRegistryError("Google identity did not include a stable subject.", 401);
  }
  if (!email || !emailVerified) {
    throw new AccountRegistryError("Google account email must be verified.", 403);
  }
  if (GOOGLE_OAUTH_ALLOWED_DOMAIN) {
    const domain = email.split("@")[1] || "";
    const hostedDomain = String(profile?.hd || "").trim().toLowerCase();
    const allowedDomain = GOOGLE_OAUTH_ALLOWED_DOMAIN.trim().toLowerCase();
    if (domain !== allowedDomain && hostedDomain !== allowedDomain) {
      throw new AccountRegistryError("Google account domain is not allowed.", 403);
    }
  }
  return {
    subject,
    email,
    displayName,
  };
}

function mockGoogleProfileForCode(code) {
  const value = String(code || "");
  if (value === "e2e-google-unverified") {
    return {
      sub: "e2e-google-unverified-sub",
      email: "unverified-google-user@example.test",
      email_verified: false,
      name: "Unverified Google User",
    };
  }
  const suffix = value.replace(/^e2e-google-/, "") || "trial";
  return {
    sub: `e2e-google-${suffix}-sub`,
    email: `${suffix.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}@example.test`,
    email_verified: true,
    name: `Google ${suffix.replace(/[-_]+/g, " ")}`,
  };
}

async function validateGoogleIdTokenClaims(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) {
    throw new AccountRegistryError("Google identity token is invalid.", 401);
  }
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new AccountRegistryError("Google identity token is invalid.", 401);
  }
  if (header.alg !== "RS256" || !header.kid) {
    throw new AccountRegistryError("Google identity token algorithm is invalid.", 401);
  }
  let jwks = googleJwksCache;
  if (!jwks || jwks.expiresAt <= Date.now()) {
    let response;
    try {
      response = await fetch(GOOGLE_OAUTH_JWKS_ENDPOINT, { signal: AbortSignal.timeout(GOOGLE_OAUTH_REQUEST_TIMEOUT_MS) });
    } catch {
      throw new AccountRegistryError("Google identity keys could not be loaded.", 401);
    }
    if (!response.ok) throw new AccountRegistryError("Google identity keys could not be loaded.", 401);
    jwks = { keys: (await response.json()).keys || [], expiresAt: Date.now() + 60 * 60 * 1000 };
    googleJwksCache = jwks;
  }
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new AccountRegistryError("Google identity signing key is unknown.", 401);
  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    signatureValid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new AccountRegistryError("Google identity token signature is invalid.", 401);
  const issuer = String(claims.iss || "");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!["https://accounts.google.com", "accounts.google.com"].includes(issuer)) {
    throw new AccountRegistryError("Google identity token issuer is invalid.", 401);
  }
  if (!audience.includes(GOOGLE_OAUTH_CLIENT_ID)) {
    throw new AccountRegistryError("Google identity token audience is invalid.", 401);
  }
  if (!claims.exp || Number(claims.exp) * 1000 <= Date.now() || !claims.nonce || !claims.sub) {
    throw new AccountRegistryError("Google identity token claims are invalid.", 401);
  }
  return claims;
}

async function exchangeGoogleOAuthCode(code, redirectUri, expectedNonce) {
  if (GOOGLE_OAUTH_MOCK_ENABLED) {
    const mockProfile = mockGoogleProfileForCode(code);
    mockProfile.nonce = code === "e2e-google-bad-nonce" ? "e2e-wrong-nonce" : expectedNonce;
    return { profile: validateGoogleProfile(mockProfile), nonce: mockProfile.nonce };
  }

  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  let tokenResponse;
  try {
    tokenResponse = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(GOOGLE_OAUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AccountRegistryError("Google authorization code exchange failed.", 401);
  }
  if (!tokenResponse.ok) {
    throw new AccountRegistryError("Google authorization code exchange failed.", 401);
  }
  const token = await tokenResponse.json();
  if (!token.access_token || !token.id_token) {
    throw new AccountRegistryError("Google authorization did not return an access token.", 401);
  }
  const idTokenClaims = await validateGoogleIdTokenClaims(token.id_token);
  let profileResponse;
  try {
    profileResponse = await fetch(GOOGLE_OAUTH_USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(GOOGLE_OAUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AccountRegistryError("Google profile lookup failed.", 401);
  }
  if (!profileResponse.ok) {
    throw new AccountRegistryError("Google profile lookup failed.", 401);
  }
  const profile = validateGoogleProfile(await profileResponse.json());
  if (profile.subject !== idTokenClaims.sub) {
    throw new AccountRegistryError("Google identity token subject does not match the profile.", 401);
  }
  return { profile, nonce: idTokenClaims.nonce };
}

function publicUserIdentity(account) {
  const accountStatus = account.accountStatus === "active" ? "standard" : account.accountStatus || "standard";
  return {
    id: account.id,
    userId: account.userId || account.id,
    displayName: account.displayName,
    email: account.email || null,
    authProvider: account.authProvider,
    accountStatus,
    trialStartedAt: account.trialStartedAt || null,
    isDefaultUser: !!account.isDefaultUser,
  };
}

async function updateProfileForSession(session, input) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const displayName = normalizeWorkspaceName(input?.displayName);
  account.displayName = displayName;
  account.updatedAt = nowIso();
  await writeAccountRegistry(registry);

  return publicUserIdentity(account);
}

function emptySessionRegistry() {
  return {
    version: SESSION_REGISTRY_SCHEMA_VERSION,
    sessions: {},
  };
}

function emptyOAuthStateRegistry() {
  return {
    version: OAUTH_STATE_REGISTRY_SCHEMA_VERSION,
    states: {},
  };
}

function sessionTokenHash(token) {
  if (SESSION_SECRET) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(String(token || "")).digest("hex");
  }
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function oauthStateHash(value) {
  const input = String(value || "");
  if (SESSION_SECRET) {
    return crypto.createHmac("sha256", SESSION_SECRET).update(input).digest("hex");
  }
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sessionExpiresAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
}

function oauthStateExpiresAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + GOOGLE_OAUTH_STATE_TTL_SECONDS * 1000).toISOString();
}

function isSessionExpired(session, at = Date.now()) {
  return !session?.expiresAt || new Date(session.expiresAt).getTime() <= at;
}

function isOAuthStateExpired(state, at = Date.now()) {
  return !state?.expiresAt || new Date(state.expiresAt).getTime() <= at;
}

function normalizeSessionRecord(record, tokenHash) {
  const createdAt = record?.createdAt || nowIso();
  return {
    id: record?.id || tokenHash,
    tokenHash,
    accountId: record?.accountId || DEFAULT_ACCOUNT_ID,
    workspaceId: record?.workspaceId || DEFAULT_WORKSPACE_ID,
    createdAt,
    lastSeenAt: record?.lastSeenAt || createdAt,
    expiresAt: record?.expiresAt || sessionExpiresAt(createdAt),
  };
}

function normalizeOAuthStateRecord(record, stateHash) {
  const createdAt = record?.createdAt || nowIso();
  return {
    id: record?.id || stateHash,
    stateHash,
    nonceHash: record?.nonceHash || "",
    returnTo: record?.returnTo || "/app",
    createdAt,
    expiresAt: record?.expiresAt || oauthStateExpiresAt(createdAt),
  };
}

async function readSessionRegistry() {
  try {
    const registry = await readJsonFile(SESSION_REGISTRY_PATH);
    if (!isPlainObject(registry)) {
      throw new AccountRegistryError("Session registry must be a JSON object.", 500);
    }
    registry.version = registry.version || SESSION_REGISTRY_SCHEMA_VERSION;
    if (registry.version > SESSION_REGISTRY_SCHEMA_VERSION) {
      throw new AccountRegistryError("Session registry schema is newer than this server supports.", 500);
    }
    registry.sessions = registry.sessions || {};
    return registry;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return emptySessionRegistry();
}

async function readOAuthStateRegistry() {
  try {
    const registry = await readJsonFile(OAUTH_STATE_REGISTRY_PATH);
    if (!isPlainObject(registry)) {
      throw new AccountRegistryError("OAuth state registry must be a JSON object.", 500);
    }
    registry.version = registry.version || OAUTH_STATE_REGISTRY_SCHEMA_VERSION;
    if (registry.version > OAUTH_STATE_REGISTRY_SCHEMA_VERSION) {
      throw new AccountRegistryError("OAuth state registry schema is newer than this server supports.", 500);
    }
    registry.states = registry.states || {};
    return registry;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return emptyOAuthStateRegistry();
}

async function writeSessionRegistry() {
  const registry = emptySessionRegistry();
  sessions.forEach((session, tokenHash) => {
    registry.sessions[tokenHash] = {
      ...session,
      tokenHash,
    };
  });
  await writeJsonFile(SESSION_REGISTRY_PATH, registry);
}

async function writeOAuthStateRegistry() {
  const registry = emptyOAuthStateRegistry();
  oauthStates.forEach((state, stateHash) => {
    const { nonce, ...persistedState } = state;
    registry.states[stateHash] = {
      ...persistedState,
      stateHash,
    };
  });
  await writeJsonFile(OAUTH_STATE_REGISTRY_PATH, registry);
}

function scheduleSessionRegistryWrite() {
  sessionRegistryWriteQueue = sessionRegistryWriteQueue
    .then(() => writeSessionRegistry())
    .catch((error) => {
      console.error("Failed to write session registry", error);
    });
  return sessionRegistryWriteQueue;
}

function scheduleOAuthStateRegistryWrite() {
  oauthStateRegistryWriteQueue = oauthStateRegistryWriteQueue
    .then(() => writeOAuthStateRegistry())
    .catch((error) => {
      console.error("Failed to write OAuth state registry", error);
    });
  return oauthStateRegistryWriteQueue;
}

async function loadSessionRegistry() {
  const registry = await readSessionRegistry();
  const now = Date.now();
  let changed = false;
  sessions.clear();
  Object.entries(registry.sessions).forEach(([tokenHash, record]) => {
    const session = normalizeSessionRecord(record, tokenHash);
    if (isSessionExpired(session, now)) {
      changed = true;
      return;
    }
    sessions.set(tokenHash, session);
    if (JSON.stringify(session) !== JSON.stringify(record)) changed = true;
  });
  if (changed || !fsSync.existsSync(SESSION_REGISTRY_PATH)) {
    await writeSessionRegistry();
  }
}

async function loadOAuthStateRegistry() {
  const registry = await readOAuthStateRegistry();
  const now = Date.now();
  let changed = false;
  oauthStates.clear();
  Object.entries(registry.states).forEach(([stateHash, record]) => {
    const state = normalizeOAuthStateRecord(record, stateHash);
    if (isOAuthStateExpired(state, now)) {
      changed = true;
      return;
    }
    oauthStates.set(stateHash, state);
    if (JSON.stringify(state) !== JSON.stringify(record)) changed = true;
  });
  if (changed) {
    await writeOAuthStateRegistry();
  }
}

function sessionRegistrySummary() {
  return {
    schemaVersion: SESSION_REGISTRY_SCHEMA_VERSION,
    activeSessionCount: sessions.size,
    ttlSeconds: SESSION_TTL_SECONDS,
    tokenStorage: SESSION_SECRET ? "hmac-sha256" : "sha256",
    sessionSecretConfigured: !!SESSION_SECRET,
    persistent: true,
  };
}

function oauthStateRegistrySummary() {
  return {
    schemaVersion: OAUTH_STATE_REGISTRY_SCHEMA_VERSION,
    activeStateCount: oauthStates.size,
    ttlSeconds: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    stateStorage: SESSION_SECRET ? "hmac-sha256" : "sha256",
    sessionSecretConfigured: !!SESSION_SECRET,
    persistent: true,
  };
}

function e2eResetAuthorized(req) {
  if (!E2E_TEST_MODE || !E2E_RESET_TOKEN) return false;
  return req.headers["x-e2e-reset-token"] === E2E_RESET_TOKEN;
}

function loginRateLimitKey(req) {
  return req.socket.remoteAddress || "unknown";
}

function loginRateLimitStatus(req) {
  const key = loginRateLimitKey(req);
  const record = loginFailures.get(key);
  if (!record) return { limited: false, key };
  const elapsed = Date.now() - record.windowStartedAt;
  if (elapsed >= LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginFailures.delete(key);
    return { limited: false, key };
  }
  return {
    limited: record.attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    key,
    retryAfterSeconds: Math.ceil((LOGIN_RATE_LIMIT_WINDOW_MS - elapsed) / 1000),
  };
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = loginFailures.get(key);
  if (!current || now - current.windowStartedAt >= LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginFailures.set(key, { attempts: 1, windowStartedAt: now });
    return;
  }
  current.attempts += 1;
}

function clearLoginFailures(key) {
  loginFailures.delete(key);
}

async function clearDirectoryContents(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(targetDir, entry.name), {
        recursive: true,
        force: true,
      }),
    ),
  );
}

async function resetE2EState() {
  await sessionRegistryWriteQueue.catch(() => {});
  await oauthStateRegistryWriteQueue.catch(() => {});
  sessionRegistryWriteQueue = Promise.resolve();
  oauthStateRegistryWriteQueue = Promise.resolve();

  sessions.clear();
  oauthStates.clear();
  loginFailures.clear();

  const registry = buildDefaultAccountRegistry();
  await writeAccountRegistry(registry);

  const workspaceRoot = workspaceStoreRootDir();
  await clearDirectoryContents(workspaceRoot);

  const defaultState = await loadExampleState();
  await writeBudgetState(DEFAULT_WORKSPACE_ID, defaultState);
  await writeSessionRegistry();
  await writeOAuthStateRegistry();

  return {
    accountCount: Object.keys(registry.accounts).length,
    workspaceCount: Object.keys(registry.workspaces).length,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
  };
}

async function createOAuthState(returnTo = "/app") {
  const state = crypto.randomBytes(24).toString("hex");
  const nonce = crypto.randomBytes(24).toString("hex");
  const createdAt = nowIso();
  const stateHash = oauthStateHash(state);
  oauthStates.set(stateHash, {
    id: stateHash,
    stateHash,
    nonce,
    nonceHash: oauthStateHash(nonce),
    returnTo: String(returnTo || "/app"),
    createdAt,
    expiresAt: oauthStateExpiresAt(createdAt),
  });
  await writeOAuthStateRegistry();
  return { state, nonce };
}

async function consumeOAuthState(state, nonce = "") {
  const stateHash = oauthStateHash(state);
  const record = oauthStates.get(stateHash);
  if (!record || isOAuthStateExpired(record)) {
    oauthStates.delete(stateHash);
    scheduleOAuthStateRegistryWrite();
    return null;
  }
  if (nonce && record.nonceHash !== oauthStateHash(nonce)) {
    return null;
  }
  oauthStates.delete(stateHash);
  await writeOAuthStateRegistry();
  return record;
}

async function writeAccountRegistry(registry) {
  await writeJsonFile(ACCOUNT_REGISTRY_PATH, registry);
}

async function ensureAccountRegistry() {
  const registry = await readAccountRegistry();
  const before = JSON.stringify(registry);
  ensureDefaultIdentity(registry);
  WORKSPACE_REGISTRY_UNOWNED_SEED_IDS.forEach((workspaceId) => ensureWorkspaceRecord(registry, workspaceId));
  const changed = before !== JSON.stringify(registry);
  if (changed || !fsSync.existsSync(ACCOUNT_REGISTRY_PATH)) {
    await writeAccountRegistry(registry);
  }
  return registry;
}

async function registeredWorkspaceIdForAccount(accountId, workspaceId) {
  const account = normalizeWorkspaceId(accountId || DEFAULT_ACCOUNT_ID);
  const registry = await ensureAccountRegistry();
  if (!registry.accounts[account]) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const ownedWorkspaceIds = registry.memberships
    .filter((membership) => membership.accountId === account)
    .map((membership) => membership.workspaceId);
  const id = workspaceId
    ? normalizeWorkspaceId(workspaceId)
    : ownedWorkspaceIds.includes(DEFAULT_WORKSPACE_ID)
      ? DEFAULT_WORKSPACE_ID
      : ownedWorkspaceIds[0];
  if (!id) {
    throw new AccountRegistryError("Account does not have a workspace.", 403);
  }
  if (!registry.workspaces[id]) {
    throw new AccountRegistryError("Workspace is not registered.", 403);
  }
  if (!hasMembership(registry, account, id)) {
    throw new AccountRegistryError("Account is not a member of this workspace.", 403);
  }
  return id;
}

async function accountReadModelForSession(session) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const memberships = registry.memberships.filter(
    (membership) => membership.accountId === account.id,
  );
  const workspaces = memberships
    .map((membership) => {
      const workspace = registry.workspaces[membership.workspaceId];
      if (!workspace) return null;
      return {
        id: workspace.id,
        name: workspace.name,
        role: membership.role,
      };
    })
    .filter(Boolean);
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === session.workspaceId) || null;
  const user = publicUserIdentity(account);

  return {
    user,
    account: {
      ...user,
    },
    currentWorkspace,
    workspaces,
  };
}

function uniqueWorkspaceId(registry, ownerAccountId, name) {
  const ownerPrefix = ownerAccountId ? `${normalizeAccountId(ownerAccountId)}-` : "";
  const base = `${ownerPrefix}${workspaceSlugFromName(name)}`;
  let candidate = base;
  let index = 2;
  while (registry.workspaces[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return normalizeWorkspaceId(candidate);
}

function uniqueAccountId(registry, seed) {
  const base = accountSlugFromSeed(seed);
  let candidate = base;
  let index = 2;
  while (registry.accounts[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return normalizeAccountId(candidate);
}

function formatMonthSortKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthDisplayName(sortKey) {
  const [year, month] = String(sortKey || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (!year || !month || Number.isNaN(date.getTime())) return String(sortKey || "");
  return `${year} ${date.toLocaleString("en-AU", { month: "long" })}`;
}

function cleanStarterState(date = new Date()) {
  const sortKey = formatMonthSortKey(date);
  const displayName = formatMonthDisplayName(sortKey);
  return {
    currentMonthId: sortKey,
    categorySettings: structuredClone(DEFAULT_CATEGORY_SETTINGS),
    months: {
      [sortKey]: {
        id: sortKey,
        sortKey,
        displayName,
        name: displayName,
        creditLimit: 15000,
        weeks: ["Period 1", "Period 2", "Period 3", "Period 4"].map((period, index) => ({
          id: `${sortKey}-p${index + 1}`,
          period,
          availableBalance: null,
          unpaidPrevious: null,
          cumulativeSpend: null,
          categoryValues: {},
          notes: "",
        })),
      },
    },
  };
}

async function ensureFreshWorkspaceStore(workspaceId) {
  const storePath = storePathForWorkspace(workspaceId);
  try {
    await fs.stat(storePath);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const state = cleanStarterState();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function isDefaultOwnerSession(session) {
  return session?.accountId === DEFAULT_ACCOUNT_ID;
}

function normalizeAccountStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!["trial", "standard"].includes(normalized)) {
    throw new AccountRegistryError("Account status must be trial or standard.", 400);
  }
  return normalized;
}

async function createAccountForSession(session, accountInput) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  if (!isDefaultOwnerSession(session)) {
    throw new AccountRegistryError("Only the default owner can create accounts.", 403);
  }

  const registry = await ensureAccountRegistry();
  const displayName = normalizeWorkspaceName(accountInput?.displayName || accountInput?.email || "New Account");
  const email = normalizeEmail(accountInput?.email);
  const password = normalizePassword(accountInput?.password);
  const requestedAccountId = String(accountInput?.accountId || "").trim();
  const accountId = requestedAccountId ? normalizeAccountId(requestedAccountId) : uniqueAccountId(registry, email || displayName);
  if (registry.accounts[accountId]) {
    throw new AccountRegistryError("Account already exists.", 409);
  }

  const workspaceName = normalizeWorkspaceName(accountInput?.workspaceName || DEFAULT_WORKSPACE_NAME);
  const workspaceId = uniqueWorkspaceId(registry, accountId, workspaceName);
  const now = nowIso();
  const account = {
    id: accountId,
    userId: accountId,
    displayName,
    email,
    authProvider: "password",
    authSubject: accountId,
    passwordHash: hashPassword(password),
    accountStatus: "standard",
    isDefaultUser: false,
    createdAt: now,
    updatedAt: now,
  };
  registry.accounts[account.id] = account;
  const workspace = ensureWorkspaceRecord(registry, workspaceId, workspaceName);
  ensureMembershipRecord(registry, account.id, workspace.id, "owner");
  await ensureFreshWorkspaceStore(workspace.id);
  await writeAccountRegistry(registry);

  return {
    account: publicUserIdentity(account),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      role: "owner",
    },
  };
}

async function findOrCreateGoogleTrialAccount(profile) {
  const registry = await ensureAccountRegistry();
  const existing = Object.values(registry.accounts).find(
    (account) => account.authProvider === "google" && account.authSubject === profile.subject,
  );
  if (existing) {
    let changed = false;
    if (existing.email !== profile.email) {
      existing.email = profile.email;
      changed = true;
    }
    if (!existing.displayName && profile.displayName) {
      existing.displayName = profile.displayName;
      changed = true;
    }
    if (!existing.accountStatus) {
      existing.accountStatus = "trial";
      changed = true;
    }
    if (changed) {
      existing.updatedAt = nowIso();
      await writeAccountRegistry(registry);
    }
    return {
      account: existing,
      created: false,
    };
  }

  const now = nowIso();
  const accountId = uniqueAccountId(registry, `google-${profile.email || profile.displayName}`);
  const workspaceName = normalizeWorkspaceName(DEFAULT_WORKSPACE_NAME);
  const workspaceId = uniqueWorkspaceId(registry, accountId, workspaceName);
  const account = {
    id: accountId,
    userId: accountId,
    displayName: profile.displayName,
    email: profile.email,
    authProvider: "google",
    authSubject: profile.subject,
    passwordHash: null,
    accountStatus: "trial",
    trialStartedAt: now,
    trialSource: "google-oauth",
    isDefaultUser: false,
    createdAt: now,
    updatedAt: now,
  };
  registry.accounts[account.id] = account;
  const workspace = ensureWorkspaceRecord(registry, workspaceId, workspaceName);
  ensureMembershipRecord(registry, account.id, workspace.id, "owner");
  await ensureFreshWorkspaceStore(workspace.id);
  await writeAccountRegistry(registry);

  return {
    account,
    created: true,
  };
}

async function listAccountsForSession(session) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  if (!isDefaultOwnerSession(session)) {
    throw new AccountRegistryError("Only the default owner can list accounts.", 403);
  }

  const registry = await ensureAccountRegistry();
  return Object.values(registry.accounts)
    .map(publicUserIdentity)
    .sort((left, right) => {
      if (left.isDefaultUser !== right.isDefaultUser) return left.isDefaultUser ? -1 : 1;
      return String(left.displayName || left.id).localeCompare(String(right.displayName || right.id));
    });
}

async function updateAccountStatusForSession(session, accountId, input) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  if (!isDefaultOwnerSession(session)) {
    throw new AccountRegistryError("Only the default owner can manage account status.", 403);
  }

  const targetAccountId = normalizeAccountId(accountId);
  if (targetAccountId === DEFAULT_ACCOUNT_ID) {
    throw new AccountRegistryError("The default owner account status cannot be changed.", 400);
  }

  const nextStatus = normalizeAccountStatus(input?.accountStatus || input?.status);
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[targetAccountId];
  if (!account) {
    throw new AccountRegistryError("Account was not found.", 404);
  }

  account.accountStatus = nextStatus;
  account.updatedAt = nowIso();
  await writeAccountRegistry(registry);
  return publicUserIdentity(account);
}

async function resetAccountPasswordForSession(session, accountId, input) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  if (!isDefaultOwnerSession(session)) {
    throw new AccountRegistryError("Only the default owner can reset account passwords.", 403);
  }

  const registry = await ensureAccountRegistry();
  const targetAccountId = normalizeAccountId(accountId);
  const account = registry.accounts[targetAccountId];
  if (!account) {
    throw new AccountRegistryError("Account was not found.", 404);
  }
  if (account.authProvider && account.authProvider !== "password") {
    throw new AccountRegistryError("Password reset is only available for password accounts.", 400);
  }

  const newPassword = normalizePassword(input?.newPassword);
  if (input?.confirmPassword !== undefined && newPassword !== String(input.confirmPassword || "")) {
    throw new AccountRegistryError("New passwords do not match.", 400);
  }

  account.passwordHash = hashPassword(newPassword);
  account.updatedAt = nowIso();
  await writeAccountRegistry(registry);

  return publicUserIdentity(account);
}

async function changePasswordForSession(session, input) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }

  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }
  if (account.authProvider && account.authProvider !== "password") {
    throw new AccountRegistryError("Password changes are only available for password accounts.", 400);
  }

  const currentPassword = String(input?.currentPassword || "");
  const newPassword = normalizePassword(input?.newPassword);
  if (input?.confirmPassword !== undefined && newPassword !== String(input.confirmPassword || "")) {
    throw new AccountRegistryError("New passwords do not match.", 400);
  }

  const hasAccountPassword = isSupportedPasswordHash(account.passwordHash);
  const currentPasswordMatches = hasAccountPassword
    ? verifyPassword(currentPassword, account.passwordHash)
    : account.id === DEFAULT_ACCOUNT_ID && APP_PASSWORD && currentPassword === APP_PASSWORD;
  if (!currentPasswordMatches) {
    throw new AccountRegistryError("Current password is incorrect.", 401);
  }

  account.passwordHash = hashPassword(newPassword);
  account.updatedAt = nowIso();
  await writeAccountRegistry(registry);

  return publicUserIdentity(account);
}

async function createWorkspaceForSession(session, name) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const workspaceName = normalizeWorkspaceName(name);
  const workspaceId = uniqueWorkspaceId(registry, account.id, workspaceName);
  const workspace = ensureWorkspaceRecord(registry, workspaceId, workspaceName);
  ensureMembershipRecord(registry, account.id, workspace.id, "owner");
  await ensureFreshWorkspaceStore(workspace.id);
  await writeAccountRegistry(registry);

  return {
    id: workspace.id,
    name: workspace.name,
    role: "owner",
  };
}

async function updateWorkspaceForSession(session, workspaceId, input) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const id = normalizeWorkspaceId(workspaceId);
  const workspace = registry.workspaces[id];
  if (!workspace) {
    throw new AccountRegistryError("Workspace is not registered.", 404);
  }
  if (membershipRole(registry, account.id, id) !== "owner") {
    throw new AccountRegistryError("Only workspace owners can update this workspace.", 403);
  }

  workspace.name = normalizeWorkspaceName(input?.name);
  workspace.updatedAt = nowIso();
  await writeAccountRegistry(registry);

  return {
    id: workspace.id,
    name: workspace.name,
    role: "owner",
  };
}

async function deleteWorkspaceStore(workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  if (id === DEFAULT_WORKSPACE_ID) return false;

  const storePath = storePathForWorkspace(id);
  const targetDir = path.resolve(path.dirname(storePath));
  const workspaceRoot = workspaceStoreRootDir();
  if (!targetDir.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new StorePathError("Workspace store path is outside the workspace store root.");
  }

  try {
    await fs.rm(targetDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function deleteWorkspaceForSession(session, workspaceId) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 403);
  }

  const id = normalizeWorkspaceId(workspaceId);
  if (id === DEFAULT_WORKSPACE_ID) {
    throw new AccountRegistryError("Default workspace cannot be deleted.", 400);
  }
  if (!registry.workspaces[id]) {
    throw new AccountRegistryError("Workspace is not registered.", 404);
  }
  if (membershipRole(registry, account.id, id) !== "owner") {
    throw new AccountRegistryError("Only workspace owners can delete this workspace.", 403);
  }

  const accountWorkspaceIds = registry.memberships
    .filter((membership) => membership.accountId === account.id && registry.workspaces[membership.workspaceId])
    .map((membership) => membership.workspaceId);
  if (accountWorkspaceIds.length < 2) {
    throw new AccountRegistryError("At least one workspace must remain.", 400);
  }

  const fallbackWorkspaceId = accountWorkspaceIds.find((candidate) => candidate !== id);
  if (!fallbackWorkspaceId) {
    throw new AccountRegistryError("At least one workspace must remain.", 400);
  }

  delete registry.workspaces[id];
  registry.memberships = registry.memberships.filter((membership) => membership.workspaceId !== id);
  await writeAccountRegistry(registry);
  let storeDeleted = false;
  let storeCleanupWarning = null;
  try {
    storeDeleted = await deleteWorkspaceStore(id);
  } catch {
    storeCleanupWarning = "Workspace registry was updated, but store cleanup failed.";
  }

  for (const activeSession of sessions.values()) {
    if (activeSession.accountId === account.id && activeSession.workspaceId === id) {
      activeSession.workspaceId = fallbackWorkspaceId;
      activeSession.lastSeenAt = nowIso();
    }
  }
  scheduleSessionRegistryWrite();

  return {
    deletedWorkspaceId: id,
    currentWorkspaceId: session.workspaceId,
    storeDeleted,
    storeCleanupWarning,
  };
}

async function deleteAccountForSession(session, accountId) {
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  if (!isDefaultOwnerSession(session)) {
    throw new AccountRegistryError("Only the default owner can delete accounts.", 403);
  }

  const registry = await ensureAccountRegistry();
  const id = normalizeAccountId(accountId);
  if (id === DEFAULT_ACCOUNT_ID || id === session.accountId) {
    throw new AccountRegistryError("Default owner account cannot be deleted.", 400);
  }
  const account = registry.accounts[id];
  if (!account) {
    throw new AccountRegistryError("Account is not registered.", 404);
  }

  const targetWorkspaceIds = registry.memberships
    .filter((membership) => membership.accountId === id)
    .map((membership) => membership.workspaceId);
  const deletedWorkspaceIds = [];
  const preservedWorkspaceIds = [];

  for (const workspaceId of targetWorkspaceIds) {
    const otherMemberships = registry.memberships.filter(
      (membership) => membership.workspaceId === workspaceId && membership.accountId !== id,
    );
    if (workspaceId !== DEFAULT_WORKSPACE_ID && otherMemberships.length === 0) {
      delete registry.workspaces[workspaceId];
      deletedWorkspaceIds.push(workspaceId);
    } else {
      preservedWorkspaceIds.push(workspaceId);
    }
  }

  delete registry.accounts[id];
  registry.memberships = registry.memberships.filter((membership) => membership.accountId !== id);
  await writeAccountRegistry(registry);

  const deletedStoreIds = [];
  const storeCleanupWarnings = [];
  for (const workspaceId of deletedWorkspaceIds) {
    try {
      if (await deleteWorkspaceStore(workspaceId)) deletedStoreIds.push(workspaceId);
    } catch {
      storeCleanupWarnings.push(workspaceId);
    }
  }

  for (const [tokenHash, activeSession] of sessions.entries()) {
    if (activeSession.accountId === id) {
      sessions.delete(tokenHash);
    }
  }
  scheduleSessionRegistryWrite();

  return {
    account: publicUserIdentity(account),
    deletedAccountId: id,
    deletedWorkspaceIds,
    deletedStoreIds,
    preservedWorkspaceIds,
    storeCleanupWarnings,
  };
}

function sessionForRequest(req) {
  if (!APP_PASSWORD) return { accountId: DEFAULT_ACCOUNT_ID, workspaceId: DEFAULT_WORKSPACE_ID };
  const token = parseCookies(req)[AUTH_COOKIE];
  if (!token) return null;
  const tokenHash = sessionTokenHash(token);
  const session = sessions.get(tokenHash);
  if (!session) return null;
  if (isSessionExpired(session)) {
    sessions.delete(tokenHash);
    scheduleSessionRegistryWrite();
    return null;
  }
  session.lastSeenAt = nowIso();
  sessions.set(tokenHash, session);
  scheduleSessionRegistryWrite();
  return session;
}

async function userForSession(session) {
  if (!session) return null;
  const registry = await ensureAccountRegistry();
  const account = registry.accounts[session.accountId];
  if (!account) return null;
  return {
    ...publicUserIdentity(account),
  };
}

async function switchSessionWorkspace(req, workspaceId) {
  if (!APP_PASSWORD) {
    return { accountId: DEFAULT_ACCOUNT_ID, workspaceId: DEFAULT_WORKSPACE_ID };
  }
  const session = sessionForRequest(req);
  if (!session) {
    throw new AccountRegistryError("Authentication required", 401);
  }
  session.workspaceId = await registeredWorkspaceIdForAccount(session.accountId, workspaceId);
  session.lastSeenAt = nowIso();
  scheduleSessionRegistryWrite();
  return session;
}

function workspaceIdForRequest(req) {
  // Real account sessions will resolve this from the user's workspace membership.
  return sessionForRequest(req)?.workspaceId || DEFAULT_WORKSPACE_ID;
}

function storePathForWorkspace(workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  return path.join(workspaceStoreRootDir(), id, "budget-store.json");
}

async function migrateLegacyDefaultWorkspaceStore() {
  const legacyPath = path.resolve(STORE_PATH);
  const currentPath = path.resolve(storePathForWorkspace(DEFAULT_WORKSPACE_ID));
  if (legacyPath === currentPath) return;

  let legacyStats = null;
  try {
    legacyStats = await fs.stat(legacyPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!legacyStats || !legacyStats.isFile()) return;

  try {
    const currentStats = await fs.stat(currentPath);
    if (currentStats.isFile()) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(currentPath), { recursive: true });
  await fs.copyFile(legacyPath, currentPath);
}

async function readBudgetState(workspaceId) {
  const storePath = storePathForWorkspace(workspaceId);
  await ensureStoreFile(storePath);
  return validateBudgetState(await readJsonFile(storePath));
}

async function writeBudgetState(workspaceId, state) {
  const storePath = storePathForWorkspace(workspaceId);
  await ensureStoreFile(storePath);
  await writeJsonFile(storePath, validateBudgetState(state));
}

async function loadDefaultState() {
  return cleanStarterState();
}

async function loadExampleState() {
  // Reset is a test/support fixture; new workspace initialization uses cleanStarterState().
  // Reads the shared JSON seed directly (no browser-script eval) so the server and the
  // Svelte client share one source of truth for the example state.
  const text = await fs.readFile(SHARED_DATA_PATH, "utf8");
  return JSON.parse(text).initialState;
}

async function loadSeedState() {
  return loadDefaultState();
}

async function ensureStoreFile(storePath = storePathForWorkspace(DEFAULT_WORKSPACE_ID)) {
  if (path.resolve(storePath) === path.resolve(storePathForWorkspace(DEFAULT_WORKSPACE_ID))) {
    await migrateLegacyDefaultWorkspaceStore();
  }
  try {
    const stats = await fs.stat(storePath);
    if (stats.isDirectory()) {
      throw new StorePathError(
        `${path.basename(storePath)} is a directory. Replace it with a JSON file before starting the app.`,
      );
    }
    return;
  } catch (error) {
    if (error instanceof StorePathError) throw error;
    if (error.code !== "ENOENT") throw error;
  }

  const state = await loadSeedState(storePath);
  await writeJsonFile(storePath, state);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function isAuthenticated(req) {
  if (!APP_PASSWORD) return true;
  return !!sessionForRequest(req);
}

function authRequired(res) {
  sendJson(res, 401, { error: "Authentication required" });
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function createSession(accountId, workspaceId) {
  const account = normalizeAccountId(accountId || DEFAULT_ACCOUNT_ID);
  const token = createSessionToken();
  const tokenHash = sessionTokenHash(token);
  const createdAt = nowIso();
  const session = {
    id: tokenHash,
    tokenHash,
    accountId: account,
    workspaceId: await registeredWorkspaceIdForAccount(account, workspaceId),
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: sessionExpiresAt(createdAt),
  };
  sessions.set(tokenHash, session);
  await writeSessionRegistry();
  return { token, session };
}

async function authenticateSessionPassword(password, accountId = "") {
  const registry = await ensureAccountRegistry();
  const targetAccountId = String(accountId || "").trim();
  if (targetAccountId) {
    const account = registry.accounts[normalizeAccountId(targetAccountId)];
    if (account?.passwordHash && verifyPassword(password, account.passwordHash)) {
      return { ok: true, accountId: account.id, method: "account-password" };
    }
    return { ok: false };
  }

  const matchingAccount = Object.values(registry.accounts).find(
    (account) => account?.passwordHash && verifyPassword(password, account.passwordHash),
  );
  if (matchingAccount) {
    return { ok: true, accountId: matchingAccount.id, method: "account-password" };
  }
  if (APP_PASSWORD && (password || "") === APP_PASSWORD) {
    return { ok: true, accountId: DEFAULT_ACCOUNT_ID, method: "fallback-password" };
  }
  return { ok: false };
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (SECURE_SESSION_COOKIE) parts.push("Secure");
  return parts.join("; ");
}

async function serveApi(req, res, pathname) {
  if (pathname === "/api/meta" && req.method === "GET") {
    sendJson(res, 200, {
      buildVersion: BUILD_VERSION,
      buildTime: BUILD_TIME,
      authEnabled: !!APP_PASSWORD,
      contactEmail: CONTACT_EMAIL,
    });
    return true;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    const registry = await ensureAccountRegistry();
    await ensureStoreFile();
    sendJson(res, 200, {
      ok: true,
      buildVersion: BUILD_VERSION,
      buildTime: BUILD_TIME,
      authEnabled: !!APP_PASSWORD,
      auth: authSummary(registry),
      oauth: {
        google: googleOAuthConfigSummary(),
        states: oauthStateRegistrySummary(),
      },
      registry: registryHealthSummary(registry),
      bootstrap: firstOwnerBootstrapSummary(registry),
      sessions: sessionRegistrySummary(),
      storage: {
        workspaceStoreRootConfigured: !!WORKSPACE_STORE_ROOT,
        defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        writeQueueDepth: storageWriteQueues.size,
        activeWriteCount: activeStorageWriteCount,
        backupRecoveryCount: storageBackupRecoveryCount,
        lastBackupRecoveryAt: lastStorageBackupRecoveryAt,
        writeFailureCount: storageWriteFailureCount,
      },
    });
    return true;
  }

  if (pathname === "/auth/google/start" && req.method === "GET") {
    if (!googleOAuthReady()) {
      sendJson(res, 503, { error: "Google sign-in is not configured." });
      return true;
    }
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const redirectUri = googleOAuthRedirectUri(req);
    if (!redirectUri) {
      sendJson(res, 500, { error: "Google sign-in redirect URI is not configured." });
      return true;
    }
    const { state, nonce } = await createOAuthState(normalizeLocalReturnTo(requestUrl.searchParams.get("returnTo")));
    const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT);
    authorizationUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    sendRedirect(res, authorizationUrl.toString());
    return true;
  }

  if (pathname === normalizeGoogleOAuthRedirectPath() && req.method === "GET") {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const oauthError = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (oauthError) {
      sendRedirect(res, `/?googleAuth=${encodeURIComponent(oauthError)}`);
      return true;
    }
    if (!googleOAuthReady() || !code || !state) {
      sendRedirect(res, "/?googleAuth=invalid");
      return true;
    }
    try {
      const redirectUri = googleOAuthRedirectUri(req);
      if (!redirectUri) {
        sendRedirect(res, "/?googleAuth=redirect");
        return true;
      }
      const stateRecord = await consumeOAuthState(state);
      if (!stateRecord) {
        sendRedirect(res, "/?googleAuth=state");
        return true;
      }
      const exchanged = await exchangeGoogleOAuthCode(code, redirectUri, stateRecord.nonce);
      if (!exchanged.nonce || oauthStateHash(exchanged.nonce) !== stateRecord.nonceHash) {
        sendRedirect(res, "/?googleAuth=nonce");
        return true;
      }
      const { account } = await findOrCreateGoogleTrialAccount(exchanged.profile);
      const created = await createSession(account.id, null);
      sendRedirect(res, normalizeLocalReturnTo(stateRecord.returnTo), sessionCookie(created.token));
    } catch (error) {
      if (error instanceof AccountRegistryError || error instanceof StorePathError) {
        sendRedirect(res, `/?googleAuth=${encodeURIComponent(error.message)}`);
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/auth/google/status" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      provider: "google",
      ...googleOAuthConfigSummary(),
      redirectUri: googleOAuthRedirectUri(req),
      loginUrl: "/auth/google/start?returnTo=%2Fapp",
    });
    return true;
  }

  if (pathname === "/api/admin/registry/diagnostics" && req.method === "GET") {
    const session = sessionForRequest(req);
    if (!session) {
      authRequired(res);
      return true;
    }
    const registry = await ensureAccountRegistry();
    sendJson(res, 200, {
      ok: true,
      auth: authSummary(registry),
      oauth: {
        google: googleOAuthConfigSummary(),
        states: oauthStateRegistrySummary(),
      },
      registry: registryHealthSummary(registry, session),
      bootstrap: firstOwnerBootstrapSummary(registry),
      sessions: sessionRegistrySummary(),
    });
    return true;
  }

  if (pathname === "/api/test/reset-all" && req.method === "POST") {
    if (!E2E_TEST_MODE) {
      sendText(res, 404, "Not found");
      return true;
    }
    if (!e2eResetAuthorized(req)) {
      sendJson(res, 403, { error: "E2E reset token is required." });
      return true;
    }
    const result = await resetE2EState();
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (pathname === "/api/admin/accounts" && req.method === "GET") {
    try {
      const accounts = await listAccountsForSession(sessionForRequest(req));
      sendJson(res, 200, { ok: true, accounts });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/admin/accounts" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const created = await createAccountForSession(sessionForRequest(req), body);
      sendJson(res, 201, { ok: true, ...created });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  const accountRouteMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
  if (accountRouteMatch && req.method === "DELETE") {
    try {
      const result = await deleteAccountForSession(
        sessionForRequest(req),
        decodeURIComponent(accountRouteMatch[1]),
      );
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  const accountPasswordRouteMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/password$/);
  if (accountPasswordRouteMatch && req.method === "PATCH") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const account = await resetAccountPasswordForSession(
        sessionForRequest(req),
        decodeURIComponent(accountPasswordRouteMatch[1]),
        body,
      );
      sendJson(res, 200, { ok: true, account });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  const accountStatusRouteMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/status$/);
  if (accountStatusRouteMatch && req.method === "PATCH") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const account = await updateAccountStatusForSession(
        sessionForRequest(req),
        decodeURIComponent(accountStatusRouteMatch[1]),
        body,
      );
      sendJson(res, 200, { ok: true, account });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/trial-requests" && req.method === "POST") {
    sendJson(res, 410, {
      error: "Trial requests are closed. Continue with Google to start a trial workspace.",
    });
    return true;
  }

  if (pathname === "/api/admin/trial-requests" && req.method === "GET") {
    sendJson(res, 410, {
      error: "Trial request management has moved to Google trial account status management.",
    });
    return true;
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const session = sessionForRequest(req);
    const user = await userForSession(session);
    sendJson(res, 200, {
      authenticated: !APP_PASSWORD || !!session,
      authEnabled: !!APP_PASSWORD,
      accountId: session?.accountId || DEFAULT_ACCOUNT_ID,
      user,
      workspaceId: session?.workspaceId || DEFAULT_WORKSPACE_ID,
    });
    return true;
  }

  if (pathname === "/api/me" && req.method === "GET") {
    const session = sessionForRequest(req);
    if (!session) {
      authRequired(res);
      return true;
    }
    sendJson(res, 200, await accountReadModelForSession(session));
    return true;
  }

  if (pathname === "/api/me/profile" && req.method === "PATCH") {
    const session = sessionForRequest(req);
    if (!session) {
      authRequired(res);
      return true;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const result = await updateProfileForSession(session, body);
      sendJson(res, 200, { ok: true, user: result });
    } catch (error) {
      if (error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/me/password" && req.method === "PATCH") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const account = await changePasswordForSession(sessionForRequest(req), body);
      sendJson(res, 200, { ok: true, account });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/session" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    if (!APP_PASSWORD) {
      sendJson(res, 200, { ok: true, authEnabled: false });
      return true;
    }
    const rateLimit = loginRateLimitStatus(req);
    if (rateLimit.limited) {
      sendJson(res, 429, { error: "Too many login attempts. Try again later." }, {
        "retry-after": String(rateLimit.retryAfterSeconds),
      });
      return true;
    }
    let created;
    try {
      const authResult = await authenticateSessionPassword(body.password || "", body.accountId || "");
      if (!authResult.ok) {
        recordLoginFailure(rateLimit.key);
        sendJson(res, 401, { error: "Invalid password" });
        return true;
      }
      clearLoginFailures(rateLimit.key);
      created = await createSession(authResult.accountId, body.workspaceId);
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    sendJsonWithCookie(
      res,
      200,
      {
        ok: true,
        authEnabled: true,
        accountId: created.session.accountId,
        user: await userForSession(created.session),
        workspaceId: created.session.workspaceId,
      },
      sessionCookie(created.token),
    );
    return true;
  }

  if (pathname === "/api/session/workspace" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const session = await switchSessionWorkspace(req, body.workspaceId);
      sendJson(res, 200, {
        ok: true,
        accountId: session.accountId,
        user: await userForSession(session),
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/workspaces" && req.method === "GET") {
    try {
      const model = await accountReadModelForSession(sessionForRequest(req));
      sendJson(res, 200, {
        currentWorkspace: model.currentWorkspace,
        workspaces: model.workspaces,
      });
    } catch (error) {
      if (error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/workspaces" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const workspace = await createWorkspaceForSession(sessionForRequest(req), body.name);
      sendJson(res, 201, { ok: true, workspace });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  const workspaceRouteMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (workspaceRouteMatch && req.method === "PATCH") {
    const workspaceId = decodeURIComponent(workspaceRouteMatch[1]);
    const body = JSON.parse((await readBody(req)) || "{}");
    try {
      const workspace = await updateWorkspaceForSession(sessionForRequest(req), workspaceId, body);
      sendJson(res, 200, { ok: true, workspace });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (workspaceRouteMatch && req.method === "DELETE") {
    const workspaceId = decodeURIComponent(workspaceRouteMatch[1]);
    try {
      const result = await deleteWorkspaceForSession(sessionForRequest(req), workspaceId);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof StorePathError || error instanceof AccountRegistryError) {
        sendJson(res, error.status || 400, { error: error.message });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (pathname === "/api/session" && req.method === "DELETE") {
    const token = parseCookies(req)[AUTH_COOKIE];
    if (token) {
      sessions.delete(sessionTokenHash(token));
      await writeSessionRegistry();
    }
    sendEmpty(res, 204, {
      "set-cookie": sessionCookie("", 0),
      "cache-control": "no-store",
    });
    return true;
  }

  if (
    ["/api/state", "/api/reset"].includes(pathname) &&
    !isAuthenticated(req)
  ) {
    authRequired(res);
    return true;
  }

  if (pathname === "/api/state" && req.method === "GET") {
    sendJson(res, 200, await readBudgetState(workspaceIdForRequest(req)));
    return true;
  }

  if (pathname === "/api/state" && req.method === "POST") {
    const body = await readBody(req);
    let state;
    try {
      state = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "Request body must be valid JSON." });
      return true;
    }
    try {
      validateBudgetState(state);
    } catch (error) {
      sendJson(res, error.status || 400, { error: error.message });
      return true;
    }
    await writeBudgetState(workspaceIdForRequest(req), state);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/reset" && req.method === "POST") {
    const state = await loadExampleState();
    await writeBudgetState(workspaceIdForRequest(req), state);
    sendJson(res, 200, state);
    return true;
  }

  return false;
}

function sendJsonWithCookie(res, status, value, cookie) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "set-cookie": cookie,
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  if (sendPublicDiscoveryFile(req, res, pathname)) return;
  if (pathname === "/budget-store.json") {
    sendText(res, 403, "Forbidden");
    return;
  }

  let requested = pathname;
  if (pathname === "/") requested = "/landing.html";
  else if (["/about", "/guide", "/faq", "/contact", "/privacy", "/terms"].includes(pathname)) requested = "/public.html";
  // `/app/*` routes are handled client-side so direct refreshes keep users in the same app section.
  else if (pathname === "/app" || pathname === "/app/" || pathname.startsWith("/app/")) requested = "/index.html";
  const resolved = path.normalize(path.join(PUBLIC_ROOT, requested));

  if (path.relative(PUBLIC_ROOT, resolved).startsWith("..")) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    // Vite emits content-hashed files under /assets/, safe to cache immutably.
    // Everything else (HTML entry points) stays no-store so deploys take effect immediately.
    const cacheControl = requested.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-store";
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": cacheControl,
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (await serveApi(req, res, url.pathname)) return;
    await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    console.error(error);
    if (error instanceof StorePathError) {
      sendJson(res, 500, { error: error.message });
      return;
    }
    if (error instanceof AccountRegistryError) {
      sendJson(res, error.status || 500, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: "Internal server error" });
  }
}

function redirectToHttps(req, res) {
  const hostHeader = req.headers.host || "";
  const hostName = hostHeader.split(":")[0];
  const location = `https://${hostName}${req.url || "/"}`;
  res.writeHead(308, {
    location,
    "cache-control": "no-store",
  });
  res.end();
}

const port = Number(process.env.PORT) || DEFAULT_PORT;
const httpsPort = Number(process.env.HTTPS_PORT) || DEFAULT_HTTPS_PORT;
const host = process.env.HOST || "127.0.0.1";
const server = http.createServer(REDIRECT_HTTP_TO_HTTPS ? redirectToHttps : handleRequest);

async function start() {
  try {
    await ensureStoreFile();
    await loadSessionRegistry();
    await loadOAuthStateRegistry();
  } catch (error) {
    console.error(error.message || error);
  }

  server.listen(port, host, () => {
    const mode = REDIRECT_HTTP_TO_HTTPS ? "redirecting HTTP to HTTPS" : `running at http://${host}:${port}`;
    console.log(`Budget app ${mode}`);
  });

  if (SSL_CERT_PATH && SSL_KEY_PATH && fsSync.existsSync(SSL_CERT_PATH) && fsSync.existsSync(SSL_KEY_PATH)) {
    const httpsOptions = {
      cert: fsSync.readFileSync(SSL_CERT_PATH),
      key: fsSync.readFileSync(SSL_KEY_PATH),
    };
    const httpsServer = https.createServer(httpsOptions, handleRequest);
    httpsServer.listen(httpsPort, host, () => {
      console.log(`Budget app running at https://${host}:${httpsPort}`);
    });
  } else if (SSL_CERT_PATH || SSL_KEY_PATH) {
    console.warn("HTTPS certificate/key not found. Starting HTTP only.");
  }
}

start();
