import {
  ALBUM_NOT_FOUND,
  DEFAULT_COPY_HAS_SIBLINGS,
  RECORD_COPY_NOT_FOUND,
} from "@/server/services/recordCareService";

// The HTTP status for an error thrown by recordCareService — shared by the
// record-copies and record-actions routes.
export function getRecordCareErrorStatus(message: string): number {
  if (message === ALBUM_NOT_FOUND || message === RECORD_COPY_NOT_FOUND) return 404;
  if (message === DEFAULT_COPY_HAS_SIBLINGS) return 409;
  return 500;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
