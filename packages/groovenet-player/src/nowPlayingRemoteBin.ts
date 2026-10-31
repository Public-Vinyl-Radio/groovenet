#!/usr/bin/env node
import { spawn } from "node:child_process";
import { GroovenetClient, clientTransport, loadConfig } from "@groovenet/client";
import { RemoteNowPlaying, startRemoteSocket } from "./nowPlayingRemote.js";

let close: (() => Promise<void>) | undefined;
let controller: RemoteNowPlaying | undefined;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--remote" || args[2] !== "--helper")
    throw new Error("Usage: groovenet-now-playing --remote <player-id>");
  const config = loadConfig();
  const api = new GroovenetClient({
    baseUrl: config.api_base,
    apiKey: config.api_key,
    playerApiKey: process.env.PLAYER_API_KEY || config.player_api_key,
    insecureTls: config.insecure_tls,
    clientName: "cli",
  });
  controller = new RemoteNowPlaying(args[1], clientTransport(api), (refs) =>
    api.batchGetTracks(refs),
  );
  await controller.start();
  const bridge = await startRemoteSocket(controller);
  close = bridge.close;
  const child = spawn(args[3], ["--socket", bridge.socketPath], { stdio: "inherit" });
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
    error instanceof Error ? error.message : "Remote integration failed.",
  );
  process.exitCode = 1;
} finally {
  controller?.close();
  await close?.();
}
