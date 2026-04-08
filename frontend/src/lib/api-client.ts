const BACKEND =
  typeof window === "undefined"
    ? process.env.BACKEND_INTERNAL_URL || "http://backend:8000"
    : "/api/backend";

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${BACKEND}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload(file: File) {
  const form = new FormData();
  form.append("file", file);
  const url = `${BACKEND}/v1/upload`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload ${res.status}: ${text}`);
  }
  return res.json();
}

export function backendStreamUrl(path: string): string {
  return `${BACKEND}${path}`;
}

export async function deleteModel(modelId: string): Promise<void> {
  const url = `${BACKEND}/v1/models/${encodeURIComponent(modelId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete ${res.status}: ${text}`);
  }
}

export async function deleteProvider(providerId: string): Promise<void> {
  const url = `${BACKEND}/v1/providers/${encodeURIComponent(providerId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete provider ${res.status}: ${text}`);
  }
}
