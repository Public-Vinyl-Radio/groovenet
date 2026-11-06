import { z } from "zod";

/** `GET /api/health`: liveness only. Does no database or Redis work. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

/** `GET /api/version`: build metadata for the About page. */
export const versionResponseSchema = z.object({
  /** `APP_VERSION`, else `IMAGE_TAG`, else the package version. */
  version: z.string(),
  /** Short commit sha; null when not baked into the image. */
  gitSha: z.string().nullable(),
  /** ISO build timestamp; null when not baked into the image. */
  builtAt: z.string().nullable(),
  nodeEnv: z.string(),
});

export const SERVICE_STATUSES = ["up", "down", "unknown"] as const;
export const serviceStatusSchema = z.enum(SERVICE_STATUSES);

/** One probed dependency on `GET /api/status`. */
export const serviceHealthSchema = z.object({
  service: z.string(),
  status: serviceStatusSchema,
  latencyMs: z.number().nullable(),
  detail: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** `GET /api/status`: reachability of the app and the services behind it. */
export const statusResponseSchema = z.object({
  services: z.array(serviceHealthSchema),
  checkedAt: z.string(),
});

/** `GET /api/update-check`: latest GitHub release against the running version. */
export const updateCheckResponseSchema = z.object({
  current: z.string(),
  /** False for dev/sha/"latest" builds whose version is not a release. */
  comparable: z.boolean(),
  latest: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseUrl: z.string().nullable(),
  releaseName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  /** Set instead of failing the request when GitHub is unreachable. */
  error: z.string().nullable(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type UpdateCheckResponse = z.infer<typeof updateCheckResponseSchema>;

export const systemJsonSchemas = {
  HealthResponse: z.toJSONSchema(healthResponseSchema),
  VersionResponse: z.toJSONSchema(versionResponseSchema),
  ServiceHealth: z.toJSONSchema(serviceHealthSchema),
  StatusResponse: z.toJSONSchema(statusResponseSchema),
  UpdateCheckResponse: z.toJSONSchema(updateCheckResponseSchema),
};
