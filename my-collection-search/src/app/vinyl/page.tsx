import { notFound } from "next/navigation";
import { developerToolsEnabled } from "@/lib/developerTools";
import VinylPipelineView from "./VinylPipelineView";

export const dynamic = "force-dynamic";

/**
 * The view from #299: what the automatic vinyl play tracking pipeline is
 * actually doing, without shelling onto the box.
 *
 * Gated like /developer — this is ops tooling, not an end-user page.
 */
export default function VinylPipelinePage() {
  if (!developerToolsEnabled()) {
    notFound();
  }

  return <VinylPipelineView />;
}
