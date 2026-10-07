import { http } from "./http";

export type RestoreDatabaseResponse = {
  message?: string;
  [k: string]: unknown;
};

// Sent as the raw request body so the server can stream it to disk; a
// multipart upload is buffered whole in server memory (#459).
export async function restoreDatabase(file: File): Promise<RestoreDatabaseResponse> {
  return await http<RestoreDatabaseResponse>(
    `/api/restore?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    }
  );
}
