import { NextResponse } from "next/server";
import { listEmbeddingModelSettings } from "@/lib/embeddings/config";
import { profileHandler } from "@/server/auth/profileRoutes";
import { readKeyStatus } from "@/server/integrations/keyStatus";

/**
 * Which optional keys are configured (#1279), for the Settings guidance. Owner
 * only, like the other household settings, and presence only: no response ever
 * carries a key's value.
 */
export const GET = profileHandler(async () => {
  const models = await listEmbeddingModelSettings();
  return NextResponse.json(
    {
      keys: readKeyStatus(),
      embedding_models: models.map(({ target_model, serving_model }) => ({
        target_model,
        serving_model,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, true);
