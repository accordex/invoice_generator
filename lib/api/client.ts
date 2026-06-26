/**
 * API error with HTTP status for client-side handling.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Typed JSON fetch wrapper for internal API routes.
 *
 * @param url - API path (relative).
 * @param init - Fetch init options.
 * @returns Parsed JSON response body.
 * @throws {ApiError} When the response is not ok.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let body: { error?: string; code?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* empty body */
    }
    throw new ApiError(body.error ?? res.statusText, res.status, body.code, body.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
