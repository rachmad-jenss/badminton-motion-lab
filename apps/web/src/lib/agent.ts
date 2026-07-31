export function agentBaseUrl(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("bml.agentUrl") || "http://127.0.0.1:8787";
  }
  return process.env.NEXT_PUBLIC_AGENT_DEFAULT_URL || "http://127.0.0.1:8787";
}

export type AgentHealthPayload = {
  ok?: boolean;
  agentVersion?: string;
  pipelineVersion?: string;
  host?: string;
  port?: number;
  byokConfigured?: boolean;
  pairingCode?: string | null;
  pairingExpiresAt?: number;
  poseModelPresent?: boolean;
  time?: string;
};

export type AgentHealthResult = {
  online: boolean;
  payload?: AgentHealthPayload;
  error?: string;
};

export type AgentReadiness = "checking" | "offline" | "not_ready" | "ready";

export class AgentRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail || `Agent request failed (HTTP ${status})`);
    this.name = "AgentRequestError";
  }
}

export function agentToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bml.agentToken");
}

export function setAgentToken(token: string): void {
  localStorage.setItem("bml.agentToken", token);
}

export function mediaUrlWithToken(pathOrUrl: string): string {
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${agentBaseUrl()}${pathOrUrl}`;
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

export async function agentHealth(baseUrl = agentBaseUrl()): Promise<{
  online: boolean;
  payload?: AgentHealthPayload;
  error?: string;
}> {
  try {
    const res = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    return { online: true, payload: (await res.json()) as AgentHealthPayload };
  } catch (e) {
    return { online: false, error: e instanceof Error ? e.message : "offline" };
  }
}

export function agentReadiness(health: AgentHealthResult | null): AgentReadiness {
  if (!health) return "checking";
  if (!health.online) return "offline";
  if (health.payload?.poseModelPresent === false) return "not_ready";
  if (typeof health.payload?.pairingCode !== "string") return "not_ready";
  return "ready";
}

export function agentReadinessLabel(readiness: AgentReadiness): string {
  switch (readiness) {
    case "checking":
      return "Checking Local Agent...";
    case "offline":
      return "Agent offline - Start Agent";
    case "not_ready":
      return "Agent online - prerequisites incomplete";
    case "ready":
      return "Agent ready";
  }
}

async function responseDetail(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.message === "string") return body.message;
  } catch {
    // Keep the plain response text as a fallback for local agent errors.
  }
  return text;
}

export function agentErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AgentRequestError) {
    if (error.status === 401) return "Pair the browser first, or refresh the pairing code.";
    if (error.status === 410) return "The local media is no longer available. Re-link the file and try again.";
    if (error.status === 422) return "The capture did not pass the quality gate. Open Capture guide and update the video.";
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function agentGet<T>(path: string): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) throw new AgentRequestError(res.status, await responseDetail(res));
  return res.json() as Promise<T>;
}

export async function agentPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new AgentRequestError(res.status, await responseDetail(res));
  return res.json() as Promise<T>;
}

export async function agentImport<T>(file: File): Promise<T> {
  const form = new FormData();
  form.append("upload", file, file.name);
  const res = await fetch(`${agentBaseUrl()}/captures/import`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new AgentRequestError(res.status, await responseDetail(res));
  return res.json() as Promise<T>;
}

export async function agentPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${agentBaseUrl()}${path}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new AgentRequestError(res.status, await responseDetail(res));
  return res.json() as Promise<T>;
}
