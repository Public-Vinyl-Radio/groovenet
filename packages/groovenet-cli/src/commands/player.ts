import {
  RemotePlayerController,
  makeRemoteApi,
  noMatchMessage,
  type PlayerController,
} from "./remotePlayer.js";
import { errorDetail } from "./playerTuiError.js";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import {
  OwnToneBackend,
  MpvBackend,
  PlayLogger,
  PlayerControlClient,
  PlayerCore,
  PlayerDaemon,
  TrackResolver,
  defaultPlayerPaths,
  hasPlayableAudio,
} from "@groovenet/player";
import { printError, printJson, printSuccess } from "../output.js";
import { boundedIntOption } from "../options.js";
import { buildKeymap } from "./playerKeymap.js";
import { formatKeymap, keymapJson } from "./playerKeys.js";

export const PLAYER_DAEMON_PATHS = defaultPlayerPaths();

export interface PlayerDaemonOptions {
  /** Overrides `player_backend` from config for this daemon. */
  backend?: string;
  /** Overrides `player_artwork` from config for this daemon. */
  artwork?: boolean;
  /** Overrides `player_log_plays` from config for this daemon. */
  logPlays?: boolean;
}

export function createPlayerDaemon(options: PlayerDaemonOptions = {}): PlayerDaemon {
  const config = loadConfig();
  const client = new GroovenetClient({
    baseUrl: config.api_base,
    apiKey: config.api_key,
    caCert: config.ca_cert,
    clientName: "cli",
  });
  const backend = options.backend ?? config.player_backend ?? "mpv";
  if (backend !== "mpv" && backend !== "owntone")
    throw new Error("Player backend must be mpv or owntone");
  if (backend === "owntone" && (!config.owntone_url || !config.owntone_library))
    throw new Error("OwnTone requires owntone_url and owntone_library in Groovenet config");
  const player = new PlayerCore(
    backend === "owntone"
      ? new OwnToneBackend({
          apiUrl: config.owntone_url!,
          password: config.owntone_password,
          outputId: config.owntone_output,
        })
      : new MpvBackend({
          caCert: config.ca_cert,
          artwork: options.artwork ?? config.player_artwork,
        }),
    new TrackResolver(client, {
      apiBase: config.api_base,
      apiKey: config.api_key,
      ...(backend === "owntone" ? { audioLibraryRoot: config.owntone_library } : {}),
    }),
  );
  if (options.logPlays ?? config.player_log_plays) {
    const friendId = config.default_friend_id;
    // The subscriber lives for the daemon's process. Failures are retried by
    // the logger and stay silent here: a daemon has no stderr, and writing to
    // it would corrupt the TUI's screen.
    new PlayLogger({
      source: player,
      friendId,
      logPlay: async ({ track, startedAt }) => {
        try {
          await client.createSpin({
            friend_id: friendId,
            release_id: track.release_id!,
            medium: "digital",
            played_at: startedAt.toISOString(),
            context_type: "player",
            output_name: null,
            track_refs: [{ track_id: track.track_id, friend_id: friendId }],
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("Digital play already logged"))
            return;
          throw error;
        }
      },
    }).start();
  }
  return new PlayerDaemon({ player, paths: PLAYER_DAEMON_PATHS });
}

async function reportFailure(action: () => Promise<unknown>, json: boolean): Promise<void> {
  try {
    const result = await action();
    if (result !== undefined) printPlayerResult(result, json);
  } catch (error) {
    printError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/** A queue entry as `queue list` returns it: local entries carry the whole track, remote ones a ref. */
interface QueueListEntry {
  id?: string;
  track?: { track_id?: string; friend_id?: number; local_audio_url?: string | null };
  audio?: boolean | null;
}

/**
 * Adds `audio` to each entry: whether the player can play it (the same rule as
 * the NO_AUDIO check). A remote queue holds refs only, so its tracks are looked
 * up; if that fails the field is `null` (unknown), never a wrong "no".
 */
export async function withAudioAvailability(
  entries: QueueListEntry[],
  remote: boolean,
): Promise<QueueListEntry[]> {
  if (!Array.isArray(entries) || entries.length === 0) return entries;
  if (!remote)
    return entries.map((entry) => ({
      ...entry,
      audio: entry.track ? hasPlayableAudio(entry.track) : null,
    }));
  let tracks: { track_id: string; friend_id: number; local_audio_url?: string | null }[] = [];
  try {
    const refs = entries.flatMap(({ track }) =>
      track?.track_id !== undefined && track.friend_id !== undefined
        ? [{ track_id: track.track_id, friend_id: track.friend_id }]
        : [],
    );
    tracks = await makeRemoteApi().batchGetTracks(refs);
  } catch {
    return entries.map((entry) => ({ ...entry, audio: null }));
  }
  const found = new Map(tracks.map((track) => [`${track.friend_id}:${track.track_id}`, track]));
  return entries.map((entry) => {
    const track = entry.track && found.get(`${entry.track.friend_id}:${entry.track.track_id}`);
    return { ...entry, audio: track ? hasPlayableAudio(track) : null };
  });
}

function printPlayerResult(result: unknown, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  if (Array.isArray(result)) {
    if (result.length === 0) {
      console.log("No entries.");
      return;
    }
    for (const [index, item] of result.entries()) {
      const entry = item as {
        id?: string;
        name?: string;
        description?: string;
        track?: { title?: string; artist?: string };
        audio?: boolean | null;
      };
      if (entry.track)
        console.log(
          `${index + 1}. ${entry.track.title ?? "Unknown track"} — ${entry.track.artist ?? "Unknown artist"} [${entry.id ?? ""}]${entry.audio === undefined ? "" : entry.audio === null ? " · audio ?" : entry.audio ? " · audio" : " · no audio"}`,
        );
      else
        console.log(
          `${index + 1}. ${entry.name ?? "Unknown device"}${entry.description ? ` — ${entry.description}` : ""} [${entry.id ?? ""}]`,
        );
    }
    return;
  }
  if (typeof result === "object" && result !== null && "status" in result) {
    if ("remote" in result) {
      const remote = (result as import("./remotePlayer.js").RemoteSnapshot).remote;
      console.log(
        `Remote: ${remote.player.name} [${remote.player.id}] · revision=${remote.player.revision} · desired=${remote.player.state.desired_output ?? "none"} · assigned=${remote.player.assigned_output ?? "none"} · ${remote.player.state.checkpoint ? "saved checkpoint" : "live state"}`,
      );
    } else console.log("Local player");
    const snapshot = result as {
      status: string;
      current?: { track?: { title?: string; artist?: string } } | null;
      position?: number;
      duration?: number | null;
      volume?: number;
      error?: { code: string; message: string } | null;
    };
    console.log(
      `Status: ${snapshot.status}${snapshot.current?.track ? ` — ${snapshot.current.track.title ?? "Unknown track"} / ${snapshot.current.track.artist ?? "Unknown artist"}` : ""}`,
    );
    if (snapshot.position !== undefined)
      console.log(
        `Position: ${Math.floor(snapshot.position)}s${snapshot.duration == null ? "" : ` / ${Math.floor(snapshot.duration)}s`}`,
      );
    if (snapshot.volume !== undefined)
      console.log(
        `${"remote" in result ? "Requested sender volume" : "Volume"}: ${snapshot.volume}%`,
      );
    if (snapshot.error) {
      console.log(`${snapshot.error.code}: ${snapshot.error.message}`);
      // Which speaker, when, and what the engine said (#1241); --json has the fields.
      const detail = errorDetail(snapshot.error);
      if (detail) console.log(`Speaker: ${detail}`);
    }
    return;
  }
}

// `player` declares --artwork too, so commander hands the flag to the parent
// even when it follows a subcommand; read it from either level.
function artworkFlag(command: Command): true | undefined {
  return command.optsWithGlobals<{ artwork?: boolean }>().artwork ? true : undefined;
}

function logPlaysFlag(command: Command): true | undefined {
  return command.optsWithGlobals<{ logPlays?: boolean }>().logPlays ? true : undefined;
}

async function withLocalClient<T>(action: (client: PlayerController) => Promise<T>): Promise<T> {
  const client = new PlayerControlClient(PLAYER_DAEMON_PATHS.socketPath);
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

export function addPlayerCommands(program: Command): void {
  const player = program
    .command("player")
    .description("Control local playback or an explicit named server player")
    .option("--remote <player-id>", "control a persistent server player; never falls back to local")
    .option(
      "--allow-unknown",
      "play to a speaker that never reports whether it is in use (AVAILABILITY_UNKNOWN) — the normal way to use such speakers; see `player set <id> --availability allow_unknown` to make it stick",
    )
    .option("--takeover", "explicitly take over occupied activity (not another player claim)");
  async function withClient<T>(action: (client: PlayerController) => Promise<T>): Promise<T> {
    const opts = player.opts<{ remote?: string; allowUnknown?: boolean; takeover?: boolean }>();
    if (!opts.remote) return withLocalClient(action);
    const control = new RemotePlayerController(makeRemoteApi(), opts.remote, {
      allow_unknown: opts.allowUnknown,
      takeover: opts.takeover,
    });
    try {
      await control.refresh();
      return await action(control);
    } finally {
      await control.close();
    }
  }
  player.enablePositionalOptions();
  player
    .option("--playlist <id>", "open a playlist in the interactive player")
    .option("--search <query>", "search for tracks in the interactive player")
    .option("--backend <name>", "playback engine: mpv (default) or owntone")
    .option("--artwork", "show mpv's cover-art window this run (overrides player_artwork)")
    .option("--log-plays", "log plays as digital spins this run (overrides player_log_plays)")
    .action(
      async (options: {
        remote?: string;
        playlist?: string;
        search?: string;
        artwork?: boolean;
        logPlays?: boolean;
        backend?: string;
      }) => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          printError(
            "The interactive player requires a TTY. Use `groovenet player start --detach` and the player control commands in scripts.",
          );
          process.exitCode = 1;
          return;
        }
        try {
          const { runPlayerTui } = await import("./playerTui.js");
          await runPlayerTui(options);
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      },
    );
  player
    .command("start")
    .description("Start the playback daemon")
    .option("--detach", "run the daemon in the background")
    .option("--backend <name>", "playback engine: mpv (default) or owntone")
    .option("--artwork", "show mpv's cover-art window (overrides player_artwork)")
    .option("--log-plays", "log plays as digital spins (overrides player_log_plays)")
    .option("--json", "print machine-readable output")
    .action(async (options: { detach?: boolean; json?: boolean }, command: Command) =>
      reportFailure(async () => {
        if (player.opts().remote)
          throw new Error(
            "Remote players already run on the server. Open player --remote <id> instead of start.",
          );
        const backend = command.optsWithGlobals<{ backend?: string }>().backend;
        const artwork = artworkFlag(command);
        const logPlays = logPlaysFlag(command);
        if (options.detach) {
          const executable = process.argv[1];
          if (!executable) throw new Error("Could not locate the Groovenet CLI entry point.");
          const spawnError: { current: Error | null } = { current: null };
          const child = spawn(
            process.execPath,
            [
              executable,
              "player",
              "_daemon",
              ...(backend ? ["--backend", backend] : []),
              ...(artwork ? ["--artwork"] : []),
              ...(logPlays ? ["--log-plays"] : []),
            ],
            { detached: true, stdio: "ignore", env: process.env },
          );
          child.once("error", (error) => {
            spawnError.current = error;
          });
          child.unref();
          const deadline = Date.now() + 5000;
          let lastError: unknown;
          while (Date.now() < deadline) {
            if (spawnError.current)
              throw new Error(`Could not start the player daemon: ${spawnError.current.message}`);
            try {
              const status = await withClient((control) => control.request("status"));
              return options.json
                ? { started: true, status }
                : (printSuccess("Player daemon started."), undefined);
            } catch (error) {
              lastError = error;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          }
          throw new Error(
            `Player daemon did not start: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
          );
        }
        const daemon = createPlayerDaemon({ backend, artwork, logPlays });
        await daemon.start();
        if (options.json) printJson({ started: true, pid: process.pid });
        else printSuccess("Player daemon running. Press Ctrl+C to stop.");
        await new Promise<void>((resolve) => {
          const shutdown = () => {
            process.off("SIGINT", shutdown);
            process.off("SIGTERM", shutdown);
            void daemon
              .stop()
              .catch((error: unknown) => {
                printError(error instanceof Error ? error.message : String(error));
                process.exitCode = 1;
              })
              .finally(resolve);
          };
          process.once("SIGINT", shutdown);
          process.once("SIGTERM", shutdown);
        });
        return undefined;
      }, options.json ?? false),
    );

  player
    .command("_daemon")
    .description("Internal daemon process")
    .option("--backend <name>", "playback engine")
    .option("--artwork", "show mpv's cover-art window")
    .option("--log-plays", "log plays as digital spins")
    .action(async (_options: unknown, command: Command) => {
      try {
        if (player.opts().remote) throw new Error("Cannot start a local daemon in remote mode.");
        const daemon = createPlayerDaemon({
          backend: command.optsWithGlobals<{ backend?: string }>().backend,
          artwork: artworkFlag(command),
          logPlays: logPlaysFlag(command),
        });
        await daemon.start();
        const shutdown = () => {
          process.off("SIGINT", shutdown);
          process.off("SIGTERM", shutdown);
          void daemon.stop().catch((error: unknown) => {
            printError(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
          });
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // Reads config only: no daemon, no TUI, no server.
  player
    .command("keys")
    .description("Show the player TUI's keymap, with any player_keymap overrides")
    .option("--json", "print machine-readable output")
    .action((options: { json?: boolean }) => {
      const keymap = buildKeymap(loadConfig().player_keymap);
      if (options.json) printJson(keymapJson(keymap));
      else for (const line of formatKeymap(keymap)) console.log(line);
    });

  player
    .command("stop")
    .description("Stop the local daemon or selected remote playback")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(
        () =>
          withClient(async (client) => {
            const result = await client.request("shutdown");
            if (!options.json) {
              printSuccess(
                player.opts().remote
                  ? "Remote playback stopped; server player retained."
                  : "Player daemon stopped.",
              );
              return undefined;
            }
            return result;
          }),
        options.json ?? false,
      ),
    );

  player
    .command("status")
    .description("Show playback status")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(() => withClient((client) => client.request("status")), options.json ?? false),
    );
  player
    .command("play [id-or-index]")
    .description("Start/resume or play a queue entry (remote UUID or zero-based index)")
    .option("--json", "print machine-readable output")
    .action(async (index: string | undefined, options: { json?: boolean }) =>
      reportFailure(
        () =>
          withClient((client) =>
            client.request(
              "play",
              index === undefined
                ? undefined
                : player.opts().remote && !/^\d+$/.test(index)
                  ? { id: index }
                  : { index: Number(index) },
            ),
          ),
        options.json ?? false,
      ),
    );
  player
    .command("pause")
    .description("Pause playback")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(
        () =>
          withClient(async (client) => {
            const status = await client.request<{ status: string }>("status");
            return client.request(status.status === "paused" ? "resume" : "pause");
          }),
        options.json ?? false,
      ),
    );
  player
    .command("next")
    .description("Skip to the next track")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(() => withClient((client) => client.request("next")), options.json ?? false),
    );
  player
    .command("prev")
    .description("Play the previous track")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(() => withClient((client) => client.request("prev")), options.json ?? false),
    );
  player
    .command("seek <seconds>")
    .description("Seek to a position in seconds")
    .option("--json", "print machine-readable output")
    .action(async (seconds: string, options: { json?: boolean }) =>
      reportFailure(
        () => withClient((client) => client.request("seek", { seconds: Number(seconds) })),
        options.json ?? false,
      ),
    );
  player
    .command("volume <level>")
    .description("Set volume from 0 to 100")
    .option("--json", "print machine-readable output")
    .action(async (level: string, options: { json?: boolean }) =>
      reportFailure(
        () => withClient((client) => client.request("volume", { volume: Number(level) })),
        options.json ?? false,
      ),
    );

  const queue = player.command("queue").description("Manage the playback queue");
  queue
    .command("add [query]")
    .description("Add the best match for a search, or a playlist, to the queue")
    .option("--all", "queue every match instead of only the best one")
    .option("--limit <n>", "queue up to n matches, best first", boundedIntOption(1))
    .option("--playlist-id <id>", "add tracks from a playlist")
    .option("--json", "print machine-readable output")
    .addHelpText(
      "after",
      `
By default one track is queued: the top result, in the same order as
\`groovenet tracks search\`. Use --limit <n> for the first n, or --all for every
match (up to 50 locally, 30 on a --remote player). A query with no match is an
error and queues nothing. Use \`tracks search\` first to see what would match.`,
    )
    .action(
      async (
        query: string | undefined,
        options: { all?: boolean; limit?: number; playlistId?: string; json?: boolean },
      ) =>
        reportFailure(async () => {
          if (options.all && options.limit !== undefined)
            throw new Error("Choose --all or --limit, not both.");
          if (options.playlistId && (options.all || options.limit !== undefined))
            throw new Error("--all and --limit apply to a search query, not --playlist-id.");
          const params = options.playlistId
            ? { playlistId: options.playlistId }
            : { query, ...(options.all ? {} : { limit: options.limit ?? 1 }) };
          const result = await withClient((client) => client.request("queue.add", params));
          // A local daemon answers a search with no match as an empty list.
          if (!options.playlistId && Array.isArray(result) && result.length === 0)
            throw new Error(noMatchMessage(query));
          return result;
        }, options.json ?? false),
    );
  queue
    .command("remove <id-or-index>")
    .description("Remove a queue entry by id or zero-based index")
    .option("--json", "print machine-readable output")
    .action(async (value: string, options: { json?: boolean }) =>
      reportFailure(
        () =>
          withClient((client) =>
            client.request(
              "queue.remove",
              /^\d+$/.test(value) ? { index: Number(value) } : { id: value },
            ),
          ),
        options.json ?? false,
      ),
    );
  queue
    .command("list")
    .description("Show the playback queue, with whether each track has playable audio")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(
        async () =>
          withAudioAvailability(
            await withClient((client) => client.request<QueueListEntry[]>("queue.list")),
            Boolean(player.opts().remote),
          ),
        options.json ?? false,
      ),
    );
  queue
    .command("move <id> <to>")
    .option("--json", "print machine-readable output")
    .action(async (id: string, to: string, options: { json?: boolean }) =>
      reportFailure(async () => {
        if (!player.opts().remote) throw new Error("Queue move requires --remote <player-id>.");
        return withClient((client) => client.request("queue.move", { id, to: Number(to) }));
      }, options.json ?? false),
    );
  queue
    .command("replace <replacement-json>")
    .description(
      "Atomically replace a remote queue with {entries, current_entry_id?, position?, play?}",
    )
    .option("--json", "print machine-readable output")
    .addHelpText(
      "after",
      `
Example:
  groovenet player --remote lounge queue replace \\
    '{"entries":[{"track_id":"TRACK_ID","friend_id":1}],"play":true}'

Payload (a JSON object):
  entries           [{ "track_id": string, "friend_id": number, "id"?: uuid }]
                    in play order; an unresolved track rejects the whole command.
                    Give "id" to keep an existing entry's identity.
  current_entry_id  entry to treat as current; omit to keep the present one,
                    null to clear it
  position          seconds into the current entry
  play              true to start (or resume) playback after replacing

Playback: removing or changing the current entry stops playback unless you pass
"play": true. Keeping it (same "id") keeps its playing or paused state. An empty
"entries" clears the queue and cannot be played. Playback still needs the speaker
to be available: see --allow-unknown and --takeover.`,
    )
    .action(async (replacement: string, options: { json?: boolean }) =>
      reportFailure(async () => {
        if (!player.opts().remote) throw new Error("Queue replace requires --remote <player-id>.");
        const value: unknown = JSON.parse(replacement);
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Replacement must be a JSON object.");
        return withClient((client) =>
          client.request("queue.replace", value as Record<string, unknown>),
        );
      }, options.json ?? false),
    );
  queue
    .command("clear")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(async () => {
        if (!player.opts().remote) throw new Error("Queue clear requires --remote <player-id>.");
        return withClient((client) => client.request("queue.clear"));
      }, options.json ?? false),
    );
  player
    .command("list")
    .description("List persistent remote players")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(async () => {
        const players = await makeRemoteApi().listServerPlayers();
        if (options.json) return players;
        for (const item of players)
          console.log(
            `${item.name} [${item.id}] · ${item.state.status} · desired=${item.state.desired_output ?? "none"} · assigned=${item.assigned_output ?? "none"}`,
          );
      }, options.json ?? false),
    );
  player
    .command("set <id>")
    .description("Set a persistent remote player's policy")
    .requiredOption("--availability <policy>", "ask, allow_unknown, or always")
    .option("--json", "print machine-readable output")
    .action(async (id: string, options: { availability: string; json?: boolean }) =>
      reportFailure(async () => {
        if (player.opts().remote) throw new Error("Use player set <id> without --remote.");
        if (!["ask", "allow_unknown", "always"].includes(options.availability))
          throw new Error("Availability must be ask, allow_unknown, or always.");
        const api = makeRemoteApi();
        const current = await api.getServerPlayer(id);
        const result = await api.commandServerPlayer(id, {
          type: "availability.set",
          expected_revision: current.revision,
          availability_policy: options.availability as "ask" | "allow_unknown" | "always",
        });
        return options.json
          ? result.player
          : (printSuccess(
              `${result.player.name}: availability ${result.player.availability_policy}`,
            ),
            undefined);
      }, options.json ?? false),
    );
  const devices = player.command("devices").description("List or select audio outputs");
  devices
    .command("list")
    .description("List available audio outputs")
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(() => withClient((client) => client.request("devices")), options.json ?? false),
    );
  devices
    .command("transfer <id>")
    .description("Explicitly detach another remote player's speaker and play here")
    .option("--json", "print machine-readable output")
    .action(async (id: string, options: { json?: boolean }) =>
      reportFailure(async () => {
        if (!player.opts().remote) throw new Error("Transfer requires --remote <player-id>.");
        return withClient((client) => client.request("devices.transfer", { id }));
      }, options.json ?? false),
    );
  // Preserve the original bare command as the list operation.
  devices
    .option("--json", "print machine-readable output")
    .action(async (options: { json?: boolean }) =>
      reportFailure(() => withClient((client) => client.request("devices")), options.json ?? false),
    );
  devices
    .command("select <id>")
    .description("Select an audio output device")
    .option("--json", "print machine-readable output")
    .action(async (id: string, options: { json?: boolean }) =>
      reportFailure(
        () => withClient((client) => client.request("devices.select", { id })),
        options.json ?? false,
      ),
    );
}
