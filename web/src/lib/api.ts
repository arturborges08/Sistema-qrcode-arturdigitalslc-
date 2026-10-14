let csrfToken: string | null = null;

export function setCsrfToken(t: string | null) {
  csrfToken = t;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet e tente novamente.", "network");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/session") {
      window.dispatchEvent(new Event("auth:expired"));
    }
    const err = data?.error;
    throw new ApiError(res.status, err?.message ?? `Erro ${res.status}`, err?.code, err?.fields);
  }
  return data as T;
}
