const API_BASE = "/api";

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function fetchAPI<T = Record<string, unknown>>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<{ data?: T; error?: string; status: number }> {
  const { skipAuth, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = localStorage.getItem("accessToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
      cache: "no-store",
    });
  } catch {
    return { error: "Network error", status: 0 };
  }

  // On 401, try refreshing
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      const newToken = localStorage.getItem("accessToken");
      headers["Authorization"] = `Bearer ${newToken}`;
      try {
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...fetchOptions,
          headers,
          cache: "no-store",
        });
      } catch {
        return { error: "Network error", status: 0 };
      }
    }
  }

  let data: T | undefined;
  try {
    data = await res.json();
  } catch {
    // No JSON body
  }

  if (!res.ok) {
    const errMsg =
      (data as Record<string, unknown>)?.error as string ||
      (data as Record<string, unknown>)?.message as string ||
      `Request failed (${res.status})`;
    return { error: errMsg, status: res.status };
  }

  return { data, status: res.status };
}

export const api = {
  get: <T = Record<string, unknown>>(endpoint: string, options?: ApiOptions) =>
    fetchAPI<T>(endpoint, { method: "GET", ...options }),

  post: <T = Record<string, unknown>>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    fetchAPI<T>(endpoint, { method: "POST", body: body ? JSON.stringify(body) : undefined, ...options }),

  put: <T = Record<string, unknown>>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    fetchAPI<T>(endpoint, { method: "PUT", body: body ? JSON.stringify(body) : undefined, ...options }),

  delete: <T = Record<string, unknown>>(endpoint: string, body?: unknown, options?: ApiOptions) =>
    fetchAPI<T>(endpoint, { method: "DELETE", body: body ? JSON.stringify(body) : undefined, ...options }),
};
