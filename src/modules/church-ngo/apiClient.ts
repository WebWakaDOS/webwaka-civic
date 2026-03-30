/**
 * WebWaka Civic — API Client Helper
 * Typed fetch wrapper for the Church/NGO Hono API.
 * Avoids generic JSX ambiguity by living in a .ts (not .tsx) file.
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem("webwaka_token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(`/api/civic${path}`, {
      ...options,
      headers,
    });

    const json = (await response.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "DELETE" });
}

export function runMigrations(): Promise<ApiResponse<{ applied: number; message: string }>> {
  return apiRequest("/migrate", { method: "POST", body: JSON.stringify({}) });
}
