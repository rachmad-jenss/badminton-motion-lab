export function agentBaseUrl(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("bml.agentUrl") || "http://127.0.0.1:8787";
  }
  return process.env.NEXT_PUBLIC_AGENT_DEFAULT_URL || "http://127.0.0.1:8787";
}

export function agentToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bml.agentToken");
}

export function setAgentToken(token: string): void {
  localStorage.setItem("bml.agentToken", token);
}

export function mediaUrlWithToken(pathOrUrl: string): string {
  const token = agentToken();
  if (!token) return pathOrUrl;
  const base = pathOrUrl.startsWith("http") ? pathOrUrl : `${agentBaseUrl()}${pathOrUrl}`;
  const url = new URL(base);
  url.searchParams.set("access_token", token);
  return url.toString();
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = agentToken();
  const headers: Record<string, string> = {};
  if (extra) {
    const h = new Headers(extra);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function agentHealth(): Promise<{
  online: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const res = await fetch(`${agentBaseUrl()}/health`, { cache: "no-store" });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    return { online: true, payload: await res.json() };
  } catch (e) {
    return { online: false, error: e instanceof Error ? e.message : "offline" };
  }
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function agentPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function agentPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
