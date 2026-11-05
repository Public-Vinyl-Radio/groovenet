#!/usr/bin/env node
import { spawn } from "node:child_process";
import { GroovenetClient, clientTransport, loadConfig } from "@groovenet/client";
import { RemoteNowPlaying, startRemoteSocket } from "./nowPlayingRemote.js";
import { NOW_PLAYING_USAGE, resolveNowPlayingTarget } from "./nowPlayingTarget.js";

let close: (() => Promise<void>) | undefined;
let controller: RemoteNowPlaying | undefined;
try {
  const args = process.argv.slice(2);
  const helperAt = args.indexOf("--helper");
  if (helperAt < 0 || !args[helperAt + 1]) throw new Error(NOW_PLAYING_USAGE);
  const helper = args[helperAt + 1];
  const config = loadConfig();
  const target = resolveNowPlayingTarget(
    [...args.slice(0, helperAt), ...args.slice(helperAt + 2)],
    config,
  );
  let helperArgs: string[] =
    target.mode === "local" && target.socket ? ["--socket", target.socket] : [];
  if (target.mode === "remote") {
    const api = new GroovenetClient({
      baseUrl: config.api_base,
      apiKey: config.api_key,
      playerApiKey: process.env.PLAYER_API_KEY || config.player_api_key,
      insecureTls: config.insecure_tls,
      clientName: "cli",
    });
    controller = new RemoteNowPlaying(target.playerId, clientTransport(api), (refs) =>
      api.batchGetTracks(refs),
    );
    await controller.start();
    const bridge = await startRemoteSocket(controller);
    close = bridge.close;
    helperArgs = ["--socket", bridge.socketPath];
  }
  const child = spawn(helper, helperArgs, { stdio: "inherit" });
  const stop = () => child.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  }).finally(() => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  });
} catch (error) {
  console.error(
    "Groovenet Now Playing:",
    error instanceof Error ? error.message : "Now Playing failed.",
  );
  process.exitCode = 1;
} finally {
  controller?.close();
  await close?.();
}
