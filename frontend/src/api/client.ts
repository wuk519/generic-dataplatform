import { clearToken, getToken } from "../lib/auth";

const BASE = "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(BASE + path, { ...init, headers });

  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearToken();
    if (window.location.pathname !== "/login") window.location.href = "/login";
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Me = { id: number; username: string; role: "admin" | "user" };

export type User = {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
};

export type Source = {
  source_id: string;
  description: string | null;
  owner_id: number | null;
  owner: string | null;
  first_seen: string;
  last_seen: string;
  event_count: number;
};

export type EventRecord = {
  id: number;
  source_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
  ingested_at: string;
};

export type EventsPage = { items: EventRecord[]; next_cursor: string | null };

export type EventQuery = {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

export type ApiKey = {
  id: number;
  name: string;
  key: string;
  owner_id: number | null;
  owner: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type StatPoint = { ts: string; count: number };

export type NumericStats = {
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  sum: number;
};

export type FieldStat = {
  name: string;
  type: "number" | "boolean" | "string" | "object" | "mixed";
  present: number;
  numeric: NumericStats | null;
};

export type FieldsResponse = { sampled_events: number; fields: FieldStat[] };

export type SeriesPoint = { ts: string } & Record<string, unknown>;
export type SeriesResponse = {
  x: string | null;
  fields: string[];
  points: SeriesPoint[];
};

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string) =>
    request<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Me>("/auth/me"),

  listUsers: () => request<User[]>("/users"),
  createUser: (username: string, password: string, role: "admin" | "user") =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  updateUser: (
    id: number,
    patch: { role?: "admin" | "user"; is_active?: boolean; password?: string },
  ) =>
    request<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteUser: (id: number) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),

  listSources: () => request<Source[]>("/sources"),
  deleteSource: (sourceId: string) =>
    request<void>(`/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    }),
  updateSource: (sourceId: string, description: string | null) =>
    request<Source>(`/sources/${encodeURIComponent(sourceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ description }),
    }),

  listEvents: (sourceId: string, params: EventQuery = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.limit) q.set("limit", String(params.limit));
    if (params.cursor) q.set("cursor", params.cursor);
    const qs = q.toString();
    return request<EventsPage>(
      `/sources/${encodeURIComponent(sourceId)}/events${qs ? `?${qs}` : ""}`,
    );
  },

  stats: (sourceId: string, bucket: "minute" | "hour" | "day" = "hour") =>
    request<StatPoint[]>(
      `/sources/${encodeURIComponent(sourceId)}/stats?bucket=${bucket}`,
    ),

  fields: (sourceId: string) =>
    request<FieldsResponse>(
      `/sources/${encodeURIComponent(sourceId)}/fields`,
    ),

  series: (
    sourceId: string,
    fields: string[],
    params: { from?: string; to?: string; limit?: number } = {},
  ) => {
    const q = new URLSearchParams();
    q.set("fields", fields.join(","));
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    if (params.limit) q.set("limit", String(params.limit));
    return request<SeriesResponse>(
      `/sources/${encodeURIComponent(sourceId)}/series?${q.toString()}`,
    );
  },

  listApiKeys: () => request<ApiKey[]>("/api-keys"),
  createApiKey: (name: string) =>
    request<ApiKey>("/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteApiKey: (id: number) =>
    request<void>(`/api-keys/${id}`, { method: "DELETE" }),

  upload: (
    file: File,
    sourceId: string,
    opts: { format?: string; description?: string } = {},
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    if (sourceId) fd.append("source_id", sourceId);
    if (opts.format) fd.append("format", opts.format);
    if (opts.description) fd.append("description", opts.description);
    return request<{ accepted: number; format: string | null }>(
      "/ingest/upload",
      { method: "POST", body: fd },
    );
  },
};
