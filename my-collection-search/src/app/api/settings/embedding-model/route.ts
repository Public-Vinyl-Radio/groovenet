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

    const { embedding_type, field, model, dims } = parsed.data;
    const updated =
      field === "target"
        ? await setTargetModel(embedding_type, model, dims)
        : await setServingModel(embedding_type, model, dims);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Failed to update embedding model settings:", err);
    return NextResponse.json(
      { error: "Failed to update embedding model settings" },
      { status: 500 }
    );
  }
}
