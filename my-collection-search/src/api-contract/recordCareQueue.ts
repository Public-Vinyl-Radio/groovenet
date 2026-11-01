import { z } from "zod";
import {
  recordCareQueueQuerySchema as queue,
  recordCareProgressQuerySchema as progress,
} from "@groovenet/contracts";
export {
  recordCareQueueResponseSchema,
  recordCareProgressResponseSchema,
} from "@groovenet/contracts";
const integer = z.string().regex(/^\d+$/).transform(Number);
export const recordCareQueueQuerySchema = queue.extend({
  friend_id: integer.pipe(queue.shape.friend_id),
  limit: integer.pipe(queue.shape.limit.unwrap()).optional(),
  offset: integer.pipe(queue.shape.offset.unwrap()).optional(),
});
export const recordCareProgressQuerySchema = progress.extend({
  friend_id: integer.pipe(progress.shape.friend_id),
  stack_size: integer.pipe(progress.shape.stack_size.unwrap()).optional(),
});
