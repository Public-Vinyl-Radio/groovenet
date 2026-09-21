#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { addConfigCommands } from "../commands/config.js";
import { addTracksCommands } from "../commands/tracks.js";
import { addAlbumsCommands } from "../commands/albums.js";
import { addPlaylistsCommands } from "../commands/playlists.js";
import { addFriendsCommands } from "../commands/friends.js";
import { addFingerprintLibraryCommand } from "../commands/fingerprintLibrary.js";
import { addVinylCommands } from "../commands/vinyl.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const { version } = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("groovenet")
  .description("CLI for your Groovenet DJ collection")
  .version(version);

addConfigCommands(program);
addTracksCommands(program);
addAlbumsCommands(program);
addPlaylistsCommands(program);
addFriendsCommands(program);
addFingerprintLibraryCommand(program);
addVinylCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
