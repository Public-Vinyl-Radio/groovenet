import { NextRequest, NextResponse } from "next/server";
import { embeddingModelUpdateBodySchema } from "@/api-contract/schemas";
import {
  listEmbeddingModelSettings,
  setServingModel,
  setTargetModel,
} from "@/lib/embeddings/config";

/**
 * The operator's two-step model switch (#386): PATCH `field: "target"` first
 * so new/backfilled jobs embed with the new model, run a backfill, then
 * PATCH `field: "serving"` once coverage looks right to cut reads over.
 * A template bump (#407) is the same cutover with only the second step:
 * deploying the new template is the "target" half, and `template_version`
 * on the serving PATCH moves reads to it.
 */
export async function GET() {
  try {
    const settings = await listEmbeddingModelSettings();
    return NextResponse.json(settings);
  } catch (err) {
    console.error("Failed to load embedding model settings:", err);
    return NextResponse.json(
      { error: "Failed to load embedding model settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = embeddingModelUpdateBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { embedding_type, field, model, dims, template_version } = parsed.data;
    const updated =
      field === "target"
        ? await setTargetModel(embedding_type, model, dims)
        : await setServingModel(embedding_type, model, dims, template_version);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Failed to update embedding model settings:", err);
    return NextResponse.json(
      { error: "Failed to update embedding model settings" },
      { status: 500 }
    );
  }
}
