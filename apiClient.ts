export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let message = text || `Request failed: ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j?.error) message = j.error;
      else if (j?.message) message = j.message;
    } catch {}
    throw new Error(message);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // If server returned plain text, wrap it.
    return (text as unknown) as T;
  }
}
