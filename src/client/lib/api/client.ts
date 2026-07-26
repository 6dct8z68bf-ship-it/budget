// Typed fetch wrapper. All requests are same-origin relative paths so the HttpOnly
// SameSite=Lax session cookie flows automatically (the dev server proxies /api + /auth
// to the Node server to preserve that). GETs are no-store to match the original app.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When true (default) a non-2xx response throws ApiError. Set false to inspect status.
  throwOnError?: boolean;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = "GET", body, throwOnError = true } = options;
  const init: RequestInit = { method, cache: "no-store" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const data = (await parseBody(response)) as T;
  if (!response.ok && throwOnError) {
    const message =
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
      `Request failed: ${method} ${path} (${response.status})`;
    throw new ApiError(response.status, message, data);
  }
  return { ok: response.ok, status: response.status, data };
}
