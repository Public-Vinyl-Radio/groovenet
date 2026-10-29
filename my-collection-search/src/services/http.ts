export async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let data: unknown = null;

  // Try to parse JSON if present
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const errorObj =
      typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const message =
      (errorObj.error as string) || (errorObj.message as string) || `HTTP ${res.status}`;
    const error = new Error(message) as Error & {
      status?: number;
      data?: unknown;
    };
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data as T;
}

export async function httpArrayBuffer(
  input: RequestInfo,
  init?: RequestInit,
): Promise<ArrayBuffer> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string };
          message = parsed.error || parsed.message || message;
        } catch {
          message = text;
        }
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return await res.arrayBuffer();
}

export async function streamLines(
  input: RequestInfo,
  init: RequestInit = {},
  onLine: (line: string) => void,
): Promise<void> {
  const res = await fetch(input, init);
  if (!res.body) {
    throw new Error("No response body for streaming");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  }

  if (buffer.trim()) {
    onLine(buffer);
  }
}
