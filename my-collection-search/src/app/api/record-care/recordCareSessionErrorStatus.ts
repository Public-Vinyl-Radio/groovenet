import {
  ANOTHER_STACK_OPEN,
  NOTHING_TO_PULL,
  RECORD_CARE_SESSION_NOT_FOUND,
  SESSION_NOT_LOGGED,
  STACK_NOT_OPEN,
} from "@/server/services/recordCareSessionService";
import { getRecordCareErrorStatus } from "../record-copies/recordCareErrorStatus";

export { errorMessage } from "../record-copies/recordCareErrorStatus";

// The HTTP status for an error thrown by recordCareSessionService, which also
// surfaces recordCareService's copy and album errors.
export function getRecordCareSessionErrorStatus(message: string): number {
  if (message === RECORD_CARE_SESSION_NOT_FOUND) return 404;
  if (
    message === STACK_NOT_OPEN ||
    message === SESSION_NOT_LOGGED ||
    message === ANOTHER_STACK_OPEN ||
    message === NOTHING_TO_PULL
  ) {
    return 409;
  }
  return getRecordCareErrorStatus(message);
}
