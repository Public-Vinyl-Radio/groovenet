import { Command } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import { printFriends, printSuccess, printError } from "../output.js";

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls, clientName: "cli" });
}

export function addFriendsCommands(program: Command): void {
  const friends = program.command("friends").description("Manage friends");

  friends
    .command("list")
    .description("List all friends")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const client = makeClient();
        const result = await client.getFriends();
        printFriends(result, opts.json ?? false);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  friends
    .command("add <username>")
    .description("Add a friend by username")
    .action(async (username: string) => {
      try {
        const client = makeClient();
        await client.addFriend(username);
        printSuccess(`✓ Added ${username} as a friend.`);
      } catch (err: unknown) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
