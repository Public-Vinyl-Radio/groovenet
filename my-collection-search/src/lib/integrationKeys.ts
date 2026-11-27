// Contextual guidance for the optional API keys (#1279). Pure logic shared by
// the Settings section, the notices and their tests. A key's value never gets
// here: the API reports only whether each one is configured.

export const integrationKeyIds = ["openai", "youtube"] as const;
export type IntegrationKeyId = (typeof integrationKeyIds)[number];

export type IntegrationKeyStatus = Record<IntegrationKeyId, { configured: boolean }>;

/** The two models of one embedding kind, as `GET /api/settings/embedding-model` reports them. */
export type EmbeddingModelPair = { target_model: string; serving_model: string };

export type IntegrationStatus = {
  keys: IntegrationKeyStatus;
  embedding_models: EmbeddingModelPair[];
};

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

export type IntegrationKeyInfo = {
  id: IntegrationKeyId;
  label: string;
  envVar: string;
  /** What the key unlocks, and what happens without it. */
  unlocks: string;
};

export const INTEGRATION_KEYS: Record<IntegrationKeyId, IntegrationKeyInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    unlocks:
      "A quality upgrade for suggestions and semantic search, plus AI metadata. Both work without it: embeddings use the bundled local model.",
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    envVar: "YOUTUBE_API_KEY",
    unlocks: "YouTube matches during enrichment. There is no local fallback.",
  },
};

/** The keys not configured, in a stable order. */
export function missingKeys(keys: IntegrationKeyStatus): IntegrationKeyId[] {
  return integrationKeyIds.filter((id) => !keys[id].configured);
}

/** Identifies a set of missing keys; a dismissal holds only while this is unchanged. */
export function missingSignature(missing: readonly IntegrationKeyId[]): string {
  return [...missing].sort().join(",");
}

export type EmbeddingGuidance =
  /** No OpenAI key; the bundled local model serves. Nothing to do. */
  | "local"
  /** A key is set but the library still serves local vectors: run the cutover. */
  | "upgrade"
  /** A key is set and the target moved, but serving has not: finish the cutover. */
  | "cutover"
  /** A key is set and OpenAI vectors are served. */
  | "openai"
  /** OpenAI vectors are in use but the key is gone, so new embeddings cannot be made. */
  | "openai-key-missing";

/**
 * Where an install stands between the local model and OpenAI. Adding a key
 * alone never switches an existing library (see seedEmbeddingModelDefaults),
 * so "upgrade" and "cutover" are the cases that need the operator.
 */
export function embeddingGuidance(status: IntegrationStatus): EmbeddingGuidance {
  const models = status.embedding_models;
  const serves = (m: EmbeddingModelPair) => m.serving_model === OPENAI_EMBEDDING_MODEL;
  const targets = (m: EmbeddingModelPair) => m.target_model === OPENAI_EMBEDDING_MODEL;
  const usesOpenai = models.some((m) => serves(m) || targets(m));

  if (!status.keys.openai.configured) return usesOpenai ? "openai-key-missing" : "local";
  if (models.length > 0 && models.every(serves)) return "openai";
  return models.some(targets) ? "cutover" : "upgrade";
}

export const EMBEDDING_CUTOVER_URL =
  "https://github.com/Public-Vinyl-Radio/groovenet/blob/main/my-collection-search/docs/IDENTITY_EMBEDDINGS.md#switching-a-kinds-model";

// Dismissal is per device, so it lives in localStorage, not the database.
export const NOTICE_DISMISSAL_KEY = "groovenet:api-key-notice-dismissed";

export function readDismissedSignature(): string | null {
  try {
    return window.localStorage.getItem(NOTICE_DISMISSAL_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedSignature(signature: string | null): void {
  try {
    if (signature === null) window.localStorage.removeItem(NOTICE_DISMISSAL_KEY);
    else window.localStorage.setItem(NOTICE_DISMISSAL_KEY, signature);
  } catch {
    // Storage can be blocked or full; the notice then simply returns next visit.
  }
}

/** The notice shows while something is missing and that exact set was not dismissed. */
export function shouldShowNotice(
  missing: readonly IntegrationKeyId[],
  dismissed: string | null,
): boolean {
  return missing.length > 0 && dismissed !== missingSignature(missing);
}
