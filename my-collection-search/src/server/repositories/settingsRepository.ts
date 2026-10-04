import { dbQuery } from "@/lib/serverDb";
import type { GamdlSettings, GamdlSettingsUpdate } from "@/types/gamdl";
import type { EmbeddingModelKind, EmbeddingModelSettings } from "@/types/embeddings";

const GAMDL_ALLOWED_FIELDS = [
  "audio_quality",
  "audio_format",
  "save_cover",
  "cover_format",
  "save_lyrics",
  "lyrics_format",
  "overwrite_existing",
  "skip_music_videos",
  "max_retries",
] as const;

type GamdlField = (typeof GAMDL_ALLOWED_FIELDS)[number];

export class SettingsRepository {
  async findDefaultLibraryFriendId(): Promise<number | null> {
    const { rows } = await dbQuery<{ friend_id: number | null }>(
      "SELECT friend_id FROM default_library_settings WHERE id = 1 LIMIT 1"
    );
    return typeof rows[0]?.friend_id === "number" ? rows[0].friend_id : null;
  }

  async upsertDefaultLibraryFriendId(friendId: number): Promise<number> {
    const { rows } = await dbQuery<{ friend_id: number }>(
      `
      INSERT INTO default_library_settings (id, friend_id, updated_at)
      VALUES (1, $1, current_timestamp)
      ON CONFLICT (id)
      DO UPDATE SET friend_id = EXCLUDED.friend_id, updated_at = current_timestamp
      RETURNING friend_id
      `,
      [friendId]
    );
    return rows[0]?.friend_id ?? friendId;
  }

  async findAiPromptByFriendId(friendId: number): Promise<string | null> {
    const { rows } = await dbQuery<{ prompt: string | null }>(
      "SELECT prompt FROM ai_prompt_settings WHERE friend_id = $1 LIMIT 1",
      [friendId]
    );
    return typeof rows[0]?.prompt === "string" ? rows[0].prompt : null;
  }

  async upsertAiPrompt(friendId: number, prompt: string): Promise<string> {
    const { rows } = await dbQuery<{ prompt: string }>(
      `
      INSERT INTO ai_prompt_settings (friend_id, prompt, updated_at)
      VALUES ($1, $2, current_timestamp)
      ON CONFLICT (friend_id)
      DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = current_timestamp
      RETURNING prompt
      `,
      [friendId, prompt]
    );
    return rows[0]?.prompt ?? prompt;
  }

  async deleteAiPrompt(friendId: number): Promise<void> {
    await dbQuery("DELETE FROM ai_prompt_settings WHERE friend_id = $1", [
      friendId,
    ]);
  }

  async ensureGamdlSettings(friendId: number): Promise<void> {
    await dbQuery(
      `
      INSERT INTO gamdl_settings (friend_id)
      VALUES ($1)
      ON CONFLICT (friend_id) DO NOTHING
      `,
      [friendId]
    );
  }

  async findGamdlSettingsByFriendId(friendId: number): Promise<GamdlSettings | null> {
    const { rows } = await dbQuery<GamdlSettings>(
      "SELECT * FROM gamdl_settings WHERE friend_id = $1 LIMIT 1",
      [friendId]
    );
    return rows[0] ?? null;
  }

  async updateGamdlSettings(
    friendId: number,
    updates: GamdlSettingsUpdate
  ): Promise<GamdlSettings | null> {
    const entries = Object.entries(updates).filter(
      ([key, value]) =>
        value !== undefined &&
        GAMDL_ALLOWED_FIELDS.includes(key as GamdlField)
    );

    if (entries.length === 0) {
      return null;
    }

    const setClause = entries
      .map(([field], index) => `${field} = $${index + 2}`)
      .join(", ");
    const values = [friendId, ...entries.map(([, value]) => value)];

    const { rows } = await dbQuery<GamdlSettings>(
      `
      UPDATE gamdl_settings
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE friend_id = $1
      RETURNING *
      `,
      values
    );

    return rows[0] ?? null;
  }

  async resetGamdlSettings(friendId: number): Promise<GamdlSettings | null> {
    await dbQuery("DELETE FROM gamdl_settings WHERE friend_id = $1", [friendId]);
    const { rows } = await dbQuery<GamdlSettings>(
      `
      INSERT INTO gamdl_settings (friend_id)
      VALUES ($1)
      RETURNING *
      `,
      [friendId]
    );
    return rows[0] ?? null;
  }

  /** Global, not per-friend: the active model is an infra choice, not a user preference (#386). */
  async findEmbeddingModelSettings(
    embeddingType: EmbeddingModelKind
  ): Promise<EmbeddingModelSettings | null> {
    const { rows } = await dbQuery<EmbeddingModelSettings>(
      "SELECT * FROM embedding_model_settings WHERE embedding_type = $1 LIMIT 1",
      [embeddingType]
    );
    return rows[0] ?? null;
  }

  async listEmbeddingModelSettings(): Promise<EmbeddingModelSettings[]> {
    const { rows } = await dbQuery<EmbeddingModelSettings>(
      "SELECT * FROM embedding_model_settings ORDER BY embedding_type"
    );
    return rows;
  }

  /** What new embedding jobs embed with. Changing this alone doesn't move reads. */
  async updateTargetModel(
    embeddingType: EmbeddingModelKind,
    model: string,
    dims: number
  ): Promise<EmbeddingModelSettings | null> {
    const { rows } = await dbQuery<EmbeddingModelSettings>(
      `
      UPDATE embedding_model_settings
      SET target_model = $2, target_dims = $3, updated_at = CURRENT_TIMESTAMP
      WHERE embedding_type = $1
      RETURNING *
      `,
      [embeddingType, model, dims]
    );
    return rows[0] ?? null;
  }

  /** What similarity queries read. The cutover step of a model switch (#386). */
  async updateServingModel(
    embeddingType: EmbeddingModelKind,
    model: string,
    dims: number
  ): Promise<EmbeddingModelSettings | null> {
    const { rows } = await dbQuery<EmbeddingModelSettings>(
      `
      UPDATE embedding_model_settings
      SET serving_model = $2, serving_dims = $3, updated_at = CURRENT_TIMESTAMP
      WHERE embedding_type = $1
      RETURNING *
      `,
      [embeddingType, model, dims]
    );
    return rows[0] ?? null;
  }
}

export const settingsRepository = new SettingsRepository();
