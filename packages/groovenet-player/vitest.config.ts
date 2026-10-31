import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: [
        "src/server/**/*.ts",
        "src/types.ts",
        "src/queue.ts",
        "src/resolver.ts",
        "src/player.ts",
        "src/mpvBackend.ts",
        "src/ownToneBackend.ts",
        "src/protocol.ts",
        "src/daemon.ts",
        "src/playThreshold.ts",
        "src/playLogger.ts",
        "src/mprisMapping.ts",
        "src/mpris.ts",
        "src/mprisBin.ts",
        "src/nowPlayingRemote.ts",
        "src/nowPlayingRemoteBin.ts",
      ],
      reporter: ["lcov", "text"],
    },
  },
});
