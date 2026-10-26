import { z } from "zod";

export const playerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
export const availabilityPolicySchema = z.enum(["ask", "allow_unknown", "always"]);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const playerTrackRefSchema = z.object({ track_id: z.string().min(1).max(255), friend_id: z.number().int().positive() }).strict();
export const serverQueueEntrySchema = playerTrackRefSchema.extend({
  id: z.uuid(), title: z.string(), artist: z.string(),
}).strict();
export const serverPlayerStateSchema = z.object({
  queue: z.array(serverQueueEntrySchema).max(10000),
  current_entry_id: z.uuid().nullable(),
  status: z.enum(["stopped", "loading", "playing", "paused", "ended", "error"]),
  position: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative().nullable(),
  volume: z.number().finite().min(0).max(100),
  desired_output: z.string().min(1).max(255).nullable(),
  checkpoint: z.boolean(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
}).strict();
export const serverPlayerSchema = z.object({
  id: playerIdSchema,
  name: z.string().trim().min(1).max(120),
  engine_id: playerIdSchema,
  availability_policy: availabilityPolicySchema,
  revision,
  assigned_output: z.string().nullable(),
  state: serverPlayerStateSchema,
}).strict();
export const createServerPlayerSchema = serverPlayerSchema.pick({ id: true, name: true, engine_id: true }).strict();
const edit = { expected_revision: revision.optional() };
const replacementEntries = z.array(playerTrackRefSchema.extend({ id: z.uuid().optional() }).strict()).max(10000)
  .refine(entries => { const ids = entries.flatMap(entry => entry.id ? [entry.id] : []); return new Set(ids).size === ids.length; }, "Queue entry IDs must be unique");
const connect = { allow_unknown: z.boolean().default(false), takeover: z.boolean().default(false) };
export const serverPlayerCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rename"), ...edit, name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal("availability.set"), ...edit, availability_policy: availabilityPolicySchema }).strict(),
  z.object({ type: z.literal("queue.add"), ...edit, tracks: z.array(playerTrackRefSchema).min(1).max(1000), at: z.number().int().nonnegative().optional() }).strict(),
  z.object({ type: z.literal("queue.remove"), ...edit, entry_id: z.uuid() }).strict(),
  z.object({ type: z.literal("queue.move"), ...edit, entry_id: z.uuid(), to: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("queue.clear"), ...edit }).strict(),
  z.object({ type: z.literal("queue.replace"), ...edit, ...connect, entries: replacementEntries, current_entry_id: z.uuid().nullable().optional(), position: z.number().finite().nonnegative().optional(), play: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("play"), ...edit, ...connect, entry_id: z.uuid().optional() }).strict(),
  z.object({ type: z.literal("pause"), ...edit }).strict(),
  z.object({ type: z.literal("resume"), ...edit, ...connect }).strict(),
  z.object({ type: z.literal("stop"), ...edit }).strict(),
  z.object({ type: z.literal("next"), ...edit, ...connect }).strict(),
  z.object({ type: z.literal("previous"), ...edit, ...connect }).strict(),
  z.object({ type: z.literal("seek"), ...edit, seconds: z.number().finite().nonnegative() }).strict(),
  z.object({ type: z.literal("volume"), ...edit, volume: z.number().finite().min(0).max(100) }).strict(),
  z.object({ type: z.literal("output.select"), ...edit, ...connect, output_id: z.string().min(1).max(255) }).strict(),
  z.object({ type: z.literal("output.transfer"), ...edit, ...connect, from_player_id: playerIdSchema, from_revision: revision, output_id: z.string().min(1).max(255), play: z.boolean().default(false) }).strict(),
]);
export const speakerObservationSchema = z.object({
  availability: z.enum(["idle", "occupied", "unknown"]),
  observed_at: z.string().nullable(),
  source: z.enum(["home_assistant", "unconfigured"]),
  // Engine identity requires an explicit, unambiguous operator-configured match.
  sender_identity: z.enum(["unknown", "groovenet", "foreign"]),
  sender_engine_id: playerIdSchema.nullable().optional(),
  entity_id: z.string().nullable().optional(),
});
export const serverPlayerDeviceSchema = z.object({
  id: z.string(), name: z.string(), description: z.string().optional(),
  assigned_player_id: playerIdSchema.nullable(),
  desired_by: z.array(playerIdSchema),
  observed: speakerObservationSchema,
});
export const serverPlayerCommandResultSchema = z.object({
  player: serverPlayerSchema,
  transfer: z.object({
    from_player: serverPlayerSchema,
    detached: z.boolean(), attached: z.boolean(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
  }).optional(),
});
export type ServerPlayer = z.infer<typeof serverPlayerSchema>;
export type ServerPlayerState = z.infer<typeof serverPlayerStateSchema>;
export type ServerQueueEntry = z.infer<typeof serverQueueEntrySchema>;
export type CreateServerPlayer = z.infer<typeof createServerPlayerSchema>;
export type ServerPlayerCommand = z.infer<typeof serverPlayerCommandSchema>;
export type ServerPlayerCommandInput = z.input<typeof serverPlayerCommandSchema>;
export type ServerPlayerCommandResult = z.infer<typeof serverPlayerCommandResultSchema>;
export type SpeakerObservation = z.infer<typeof speakerObservationSchema>;
export type ServerPlayerDevice = z.infer<typeof serverPlayerDeviceSchema>;
export type PlayerTrackRef = z.infer<typeof playerTrackRefSchema>;

export const serverPlayerListSchema = z.object({ players: z.array(serverPlayerSchema) });
export const serverPlayerDeviceListSchema = z.object({ devices: z.array(serverPlayerDeviceSchema) });
export const playerEngineListSchema = z.object({ engines: z.array(playerIdSchema) });
export const serverPlayerEventSchema = z.object({ type: z.literal("snapshot"), player: serverPlayerSchema, worker_instance: z.uuid(), sequence: revision });
export const serverPlayerPositionSchema = z.object({ type: z.literal("position"), player_id: playerIdSchema, revision, current_entry_id: z.uuid().nullable(), position: z.number().finite().nonnegative(), duration: z.number().finite().nonnegative().nullable(), observed_at: z.string(), worker_instance: z.uuid(), sequence: revision });
export const serverPlayerStreamEventSchema = z.discriminatedUnion("type", [serverPlayerEventSchema, serverPlayerPositionSchema]);
export const playerJsonSchemas = {
  ServerPlayer: z.toJSONSchema(serverPlayerSchema),
  CreateServerPlayer: z.toJSONSchema(createServerPlayerSchema),
  ServerPlayerCommand: z.toJSONSchema(serverPlayerCommandSchema, { io: "input" }),
  ServerPlayerCommandResult: z.toJSONSchema(serverPlayerCommandResultSchema),
  ServerPlayerList: z.toJSONSchema(serverPlayerListSchema),
  ServerPlayerDeviceList: z.toJSONSchema(serverPlayerDeviceListSchema),
  PlayerEngineList: z.toJSONSchema(playerEngineListSchema),
  ServerPlayerEvent: z.toJSONSchema(serverPlayerEventSchema),
  ServerPlayerPosition: z.toJSONSchema(serverPlayerPositionSchema),
};
