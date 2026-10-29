import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("spin logging schema architecture", () => {
  it("uses cascade deletes from sessions to selections and track events", () => {
    const migration = readProjectFile("migrations/1772300000000_add_spin_logging_tables.js");

    expect(migration).toContain('references: "spin_sessions(id)"');
    expect(migration).toContain('pgm.createTable("spin_session_selections"');
    expect(migration).toContain('pgm.createTable("track_spin_events"');

    const cascadeMatches = migration.match(/onDelete:\s*"CASCADE"/g) ?? [];
    expect(cascadeMatches.length).toBeGreaterThanOrEqual(4);
  });
});

describe("spin logging playback isolation", () => {
  const spinFeatureFiles = [
    "src/server/services/spinLoggingService.ts",
    "src/app/api/spins/route.ts",
    "src/app/api/spins/[id]/route.ts",
    "src/app/api/albums/[releaseId]/playable-structure/route.ts",
    "src/services/internalApi/spins.ts",
    "src/hooks/useSpinsQuery.ts",
  ];

  const forbiddenPatterns = [
    "PlaylistPlayerProvider",
    "usePlaylistPlayer",
    "playback/local",
    "AudioPlayerService",
    "useAudioEngine",
    "audioEngine",
    "MediaSession",
    "MPD",
    "AVPlayer",
  ];

  it("does not import or reference playback-specific modules", () => {
    for (const file of spinFeatureFiles) {
      const source = readProjectFile(file);
      for (const forbidden of forbiddenPatterns) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
