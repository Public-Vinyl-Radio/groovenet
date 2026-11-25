import type { PoolClient } from "pg";
import type { EmbeddingModelKind } from "@/types/embeddings";
type Queryable = Pick<PoolClient, "query">;

/** Below 10k vectors use exact cosine order: an empty-trained 100-list IVF
 * index can otherwise omit most of a small library. + 0 prevents matching
 * the ANN expression index without changing distance or session settings.
 * The count stops at the threshold, including on very large libraries.
 */
export async function exactOrderSuffix(
  client: Queryable,
  kind: EmbeddingModelKind,
  model: string,
): Promise<string> {
  const { rows } = await client.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count FROM (
        SELECT 1 FROM track_embeddings WHERE embedding_type = $1 AND model = $2 LIMIT 10000
      ) AS sample
    `,
    [kind, model],
  );
  return Number(rows[0]?.count ?? 0) < 10000 ? " + 0" : "";
}
