import type { ServiceHealth } from "@/services/internalApi/system";

// The "what next" steps after a first import (#1246): hard-coded, each naming what it needs. The
// app can tell three of those needs apart from `/api/status` (Essentia, the GA service and the
// embedding provider answer it). Apple Music and YouTube have no cheap probe, so they always show
// with their requirement rather than behind a probe invented for this.

export type ChecklistStep = {
  id: "analyse" | "apple-music" | "youtube" | "ai" | "playlist";
  title: string;
  detail: string;
  href: string;
  /** What is missing, when it is known or can't be known; absent when the step is ready to use. */
  needs?: string;
};

type Availability = "up" | "down" | "unknown";

function availability(services: readonly ServiceHealth[] | undefined, name: string): Availability {
  const service = services?.find((s) => s.service === name);
  if (!service) return "unknown";
  return service.status === "up" ? "up" : service.status === "down" ? "down" : "unknown";
}

/**
 * The steps that apply to this install. `services` is `/api/status`'s list, or undefined while
 * it loads or if it fails, when each detectable step shows with its requirement.
 */
export function checklistSteps(services: readonly ServiceHealth[] | undefined): ChecklistStep[] {
  const essentia = availability(services, "essentia");
  const ga = availability(services, "ga-service");
  const embeddings = availability(services, "embeddings");

  const steps: ChecklistStep[] = [
    {
      id: "analyse",
      title: "Analyse your audio",
      detail: "Download a track's audio to read its BPM, key and mood.",
      href: "/albums",
      needs: essentia === "up" ? undefined : "the downloads profile",
    },
    {
      id: "apple-music",
      title: "Connect Apple Music",
      detail: "Link records to Apple Music for previews and playback.",
      href: "/settings/apple-music",
      needs: "Apple Music keys (APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY)",
    },
    {
      id: "youtube",
      title: "Find YouTube links",
      detail: "Match tracks to YouTube videos from the enrichment wizard.",
      href: "/enrich",
      needs: "YOUTUBE_API_KEY",
    },
  ];

  // Already working: nothing to set up, so nothing to suggest.
  if (embeddings !== "up") {
    steps.push({
      id: "ai",
      title: "Turn on AI search and notes",
      detail: "Search by vibe and draft notes for your records.",
      href: "/settings/ai-metadata",
      needs: "OPENAI_API_KEY",
    });
  }

  steps.push({
    id: "playlist",
    title: "Build a playlist",
    detail: "Pick tracks and save them as a set.",
    href: "/tracks",
    needs: ga === "up" ? undefined : "the optimize profile, to order it automatically",
  });

  return steps;
}
