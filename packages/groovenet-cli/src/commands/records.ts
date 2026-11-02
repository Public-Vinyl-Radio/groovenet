import { Command, InvalidArgumentError } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type {
  CleaningMethod,
  RecordActionInput,
  RecordActionType,
  RecordCareProgressResponse,
  RecordCareQueueItem,
  RecordCareQueueResponse,
  RecordCareStatus,
  SleeveType,
} from "@groovenet/client";
import Table from "cli-table3";
import chalk from "chalk";
import { boundedIntOption } from "../options.js";
import { printError, printJson } from "../output.js";

const positiveInt = boundedIntOption(1);
const sleeveTypes: SleeveType[] = ["original", "paper", "poly-rice-paper-poly", "poly"];
const cleaningMethods: CleaningMethod[] = [
  "dry-brush",
  "wet-manual",
  "vacuum",
  "ultrasonic",
  "other",
];
const careStatuses: RecordCareStatus[] = ["never_cleaned", "overdue", "needs_sleeve"];

function choice<T extends string>(values: readonly T[]) {
  return (value: string): T => {
    if (!values.includes(value as T))
      throw new InvalidArgumentError(`expected one of: ${values.join(", ")}`);
    return value as T;
  };
}

function dateOption(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new InvalidArgumentError("expected a date or ISO timestamp");
  return date.toISOString();
}

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    insecureTls: cfg.insecure_tls,
    clientName: "cli",
  });
}

type Common = { friendId?: number; json?: boolean };
function friendId(opts: Common): number {
  return opts.friendId ?? loadConfig().default_friend_id;
}

function table(head: string[], rows: (string | number)[][]): void {
  if (rows.length === 0) {
    console.log("No records found.");
    return;
  }
  const result = new Table({ head: head.map((h) => chalk.cyan(h)), wordWrap: true });
  for (const row of rows) result.push(row);
  console.log(result.toString());
}

function show(data: unknown, json: boolean, head: string[], rows: (string | number)[][]): void {
  if (json) printJson(data);
  else table(head, rows);
}

function handle(action: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await action();
    } catch (error: unknown) {
      printError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
}

const common = <T extends Command>(command: T): T =>
  command
    .option("--friend-id <id>", "Collection owner", positiveInt)
    .option("--json", "Output raw API response as JSON") as T;

type LogOptions = Common & { copy?: number; at?: string; method?: CleaningMethod; note?: string };
export function actionInput(
  release: string,
  actionType: RecordActionInput["action_type"],
  opts: LogOptions,
  sleeveType?: SleeveType,
): RecordActionInput {
  return {
    friend_id: friendId(opts),
    action_type: actionType,
    ...(opts.copy ? { copy_id: opts.copy } : { release_id: release }),
    ...(opts.at ? { occurred_at: opts.at } : {}),
    ...(opts.note ? { notes: opts.note } : {}),
    ...(sleeveType ? { sleeve_type: sleeveType } : {}),
    ...(opts.method ? { details: { method: opts.method } } : {}),
  } as RecordActionInput;
}

function actionOptions(command: Command): Command {
  return common(command)
    .option("--copy <id>", "Physical copy ID", positiveInt)
    .option("--at <date>", "When the action happened", dateOption)
    .option("--note <text>", "Action notes");
}

async function logAction(
  client: GroovenetClient,
  release: string,
  actionType: RecordActionInput["action_type"],
  opts: LogOptions,
  sleeveType?: SleeveType,
) {
  if (opts.copy) {
    const copies = await client.listRecordCopies(friendId(opts), release);
    if (!copies.some((copy) => copy.id === opts.copy)) {
      throw new Error(`Copy ${opts.copy} does not belong to release ${release}.`);
    }
  }
  return client.logRecordAction(actionInput(release, actionType, opts, sleeveType));
}

type StackLogOptions = LogOptions & { stack?: number; sleeve?: SleeveType };
type QueueGroup = "spun" | "new" | "backlog";
const queueGroups: QueueGroup[] = ["spun", "new", "backlog"];
const queueKeys = { spun: "spun_recently", new: "new_arrivals", backlog: "backlog" } as const;

function stackOptions(command: Command): Command {
  return command.option(
    "--stack <n>",
    "Log every record in open stack N (the number `records stack` shows)",
    positiveInt,
  );
}

/**
 * Exactly one of a release or `--stack` names the target. With `--stack` there
 * is no release, so the lone positional of `sleeve` and `log` is their value.
 */
function splitTarget(
  first: string | undefined,
  second: string | undefined,
  opts: StackLogOptions,
  hasValue: boolean,
): { release: string; value?: string } {
  if (opts.stack) {
    if (opts.copy) throw new Error("--copy cannot be used with --stack.");
    if ((hasValue ? second : first) !== undefined)
      throw new Error("Give a release or --stack, not both.");
    return { release: "", value: hasValue ? first : undefined };
  }
  if (!first) throw new Error("Give a release, or --stack N for a pulled stack.");
  return { release: first, value: second };
}

/** The friend's open stack numbered `stackNo`, as `--stack N` names it. */
async function resolveStack(client: GroovenetClient, fid: number, stackNo: number) {
  const { items } = await client.listRecordCareStacks({ friend_id: fid, status: "open" });
  const match = items.find((stack) => stack.stack_no === stackNo);
  if (match) return match;
  const open = items.find((stack) => stack.stack_no !== null);
  throw new Error(
    open
      ? `No open stack ${stackNo}. The open stack is ${open.stack_no}.`
      : `No open stack ${stackNo}. Pull one with \`records stack\`.`,
  );
}

async function logStack(
  client: GroovenetClient,
  stackNo: number,
  actionTypes: RecordActionType[],
  opts: StackLogOptions,
  sleeveType?: SleeveType,
): Promise<void> {
  const fid = friendId(opts);
  const stack = await resolveStack(client, fid, stackNo);
  const result = await client.logRecordCareSession({
    friend_id: fid,
    stack_id: stack.id,
    action_types: actionTypes,
    source: "cli",
    ...(opts.at ? { occurred_at: opts.at } : {}),
    ...(opts.note ? { notes: opts.note } : {}),
    ...(sleeveType ? { sleeve_type: sleeveType } : {}),
    ...(opts.method ? { details: { method: opts.method } } : {}),
  });
  if (opts.json) printJson(result);
  else
    console.log(
      `Logged ${actionTypes.join(" + ")} for stack ${stackNo} (${result.session.items.length} records, session ${result.session.id}).`,
    );
}

function queueRows(
  queue: RecordCareQueueResponse,
  group: QueueGroup | undefined,
  limit: number | undefined,
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const add = <T extends RecordCareQueueItem>(
    name: QueueGroup,
    items: T[],
    note: (item: T) => string,
  ) => {
    if (group && group !== name) return;
    for (const item of items.slice(0, limit)) {
      rows.push([
        name,
        item.release_id,
        item.title,
        item.artist,
        item.copy_id ?? "—",
        item.inner_sleeve_type ?? "—",
        note(item),
      ]);
    }
  };
  add("spun", queue.spun_recently.items, (i) => `${i.spin_count} spins, ${i.window_label}`);
  add("new", queue.new_arrivals.items, (i) => `added ${i.added_at ?? "—"}`);
  add("backlog", queue.backlog.items, () => "—");
  return rows;
}

/** "10 / 414 cleaned · stack 2 of 42 next · 3.5 stacks/week → 2027-03-01" */
function progressLine(p: RecordCareProgressResponse): string {
  const parts = [`${p.cleaned} / ${p.total} cleaned`];
  if (p.next_stack_no !== null) parts.push(`stack ${p.next_stack_no} of ${p.stacks_total} next`);
  else if (p.total > 0) parts.push("library complete");
  if (p.pace) {
    parts.push(
      `${Math.round(p.pace.stacks_per_week * 10) / 10} stacks/week → ${p.pace.projected_finish_date.slice(0, 10)}`,
    );
  }
  return parts.join(" · ");
}

export function addRecordsCommands(program: Command): void {
  const records = program.command("records").description("Manage physical copies and record care");

  stackOptions(actionOptions(records.command("clean [release]").description("Log a cleaning")))
    .option("--method <method>", "Cleaning method", choice(cleaningMethods))
    .option(
      "--sleeve <type>",
      "Also log an inner sleeve change (with --stack)",
      choice(sleeveTypes),
    )
    .action(async (release: string | undefined, opts: StackLogOptions) =>
      handle(async () => {
        const target = splitTarget(release, undefined, opts, false);
        if (opts.sleeve && !opts.stack) {
          throw new Error("--sleeve needs --stack. For one record use `records sleeve <release>`.");
        }
        const client = makeClient();
        if (opts.stack) {
          const types: RecordActionType[] = opts.sleeve ? ["cleaned", "sleeved"] : ["cleaned"];
          return logStack(client, opts.stack, types, opts, opts.sleeve);
        }
        const result = await logAction(client, target.release, "cleaned", opts);
        if (opts.json) printJson(result);
        else
          console.log(
            `Cleaned ${target.release} (copy ${result.copy.id}, action ${result.action.id}).`,
          );
      })(),
    );

  stackOptions(
    actionOptions(
      records.command("sleeve [release] [type]").description("Log an inner sleeve change"),
    ),
  ).action(async (first: string | undefined, second: string | undefined, opts: StackLogOptions) =>
    handle(async () => {
      const { release, value } = splitTarget(first, second, opts, true);
      if (!value) throw new Error("A sleeve type is required.");
      const sleeveType = choice(sleeveTypes)(value);
      const client = makeClient();
      if (opts.stack) return logStack(client, opts.stack, ["sleeved"], opts, sleeveType);
      const result = await logAction(client, release, "sleeved", opts, sleeveType);
      if (opts.json) printJson(result);
      else
        console.log(
          `Sleeved ${release} with ${value} (copy ${result.copy.id}, action ${result.action.id}).`,
        );
    })(),
  );

  stackOptions(
    actionOptions(
      records.command("log [release] [action]").description("Log an inspection or repair"),
    ),
  ).action(async (first: string | undefined, second: string | undefined, opts: StackLogOptions) =>
    handle(async () => {
      const { release, value } = splitTarget(first, second, opts, true);
      if (!value) throw new Error("An action (inspected or repaired) is required.");
      const actionType = choice(["inspected", "repaired"] as const)(value);
      const client = makeClient();
      if (opts.stack) return logStack(client, opts.stack, [actionType], opts);
      const result = await logAction(client, release, actionType, opts);
      if (opts.json) printJson(result);
      else
        console.log(
          `Logged ${actionType} for ${release} (copy ${result.copy.id}, action ${result.action.id}).`,
        );
    })(),
  );

  common(records.command("queue").description("Show the care to-do queue"))
    .option("--group <group>", "Only one group: spun, new or backlog", choice(queueGroups))
    .option("--limit <n>", "Maximum records per group", positiveInt)
    .action(async (opts: Common & { group?: QueueGroup; limit?: number }) =>
      handle(async () => {
        const result = await makeClient().getRecordCareQueue({
          friend_id: friendId(opts),
          ...(opts.limit ? { limit: opts.limit } : {}),
        });
        const groups = queueRows(result, opts.group, opts.limit);
        if (opts.json) {
          printJson(opts.group ? result[queueKeys[opts.group]] : result);
          return;
        }
        table(["Group", "Release", "Album", "Artist", "Copy", "Sleeve", "Note"], groups);
      })(),
    );

  common(
    records.command("stack").description("Pull the next stack to care for, or show the open one"),
  )
    .option("--size <n>", "Records in a new stack", boundedIntOption(1))
    .option("--discard", "Discard the open stack without logging it")
    .action(async (opts: Common & { size?: number; discard?: boolean }) =>
      handle(async () => {
        const client = makeClient();
        const fid = friendId(opts);
        if (opts.discard) {
          if (opts.size) throw new Error("--size cannot be used with --discard.");
          const [open] = (await client.listRecordCareStacks({ friend_id: fid, status: "open" }))
            .items;
          if (!open) throw new Error("No open stack to discard.");
          const result = await client.discardRecordCareStack(open.id, fid);
          if (opts.json) printJson(result);
          else console.log(`Discarded stack ${result.stack_no}.`);
          return;
        }
        const result = await client.pullRecordCareStack({
          friend_id: fid,
          ...(opts.size ? { size: opts.size } : {}),
          source: "cli",
        });
        if (opts.json) {
          printJson(result);
          return;
        }
        const { stack } = result;
        console.log(
          `Stack ${stack.stack_no} (${result.created ? "pulled" : "already open"}), ${stack.items.length} records:`,
        );
        table(
          ["#", "Release", "Album", "Artist", "Copy", "Sleeve", "Last cleaned"],
          stack.items.map((item) => [
            item.position,
            item.release_id,
            item.album_title ?? "—",
            item.album_artist ?? "—",
            item.copy_id ?? "—",
            item.inner_sleeve_type ?? "—",
            item.last_cleaned_at ?? "never",
          ]),
        );
        console.log(`Log it with: groovenet records clean --stack ${stack.stack_no}`);
      })(),
    );

  common(records.command("sessions").description("Show the care log"))
    .option("--limit <n>", "Maximum entries", positiveInt, 20)
    .action(async (opts: Common & { limit: number }) =>
      handle(async () => {
        const result = await makeClient().listRecordCareLog({
          friend_id: friendId(opts),
          limit: opts.limit,
        });
        show(
          result,
          !!opts.json,
          ["Session", "Action", "Stack", "When", "Source", "Care", "Records", "Detail", "Voided"],
          result.items.map((e) => [
            e.session_id ?? "—",
            e.action_id ?? "—",
            e.stack_no ?? "—",
            e.occurred_at,
            e.source,
            e.action_types.join(" + "),
            e.record_count,
            e.sleeve_type ?? e.method ?? e.notes ?? "—",
            e.voided ? "yes" : "—",
          ]),
        );
      })(),
    );

  common(records.command("progress").description("Show cleaning progress and pace")).action(
    async (opts: Common) =>
      handle(async () => {
        const result = await makeClient().getRecordCareProgress({ friend_id: friendId(opts) });
        if (opts.json) printJson(result);
        else console.log(progressLine(result));
      })(),
  );

  const copies = common(records.command("copies").description("List, add, label or remove copies"));
  // Commander assigns duplicate option names to the parent `copies` command,
  // even when they appear after a subcommand. Carry them into child actions.
  const copyOptions = <T extends Common>(opts: T): T => ({ ...copies.opts<Common>(), ...opts });
  copies.argument("[release]").action(async (release: string | undefined, opts: Common) =>
    handle(async () => {
      if (!release) throw new Error("A release ID is required. Use `records copies <release>`.");
      const result = await makeClient().listRecordCopies(friendId(opts), release);
      show(
        result,
        !!opts.json,
        ["ID", "Label", "Default", "Sleeve", "Last cleaned"],
        result.map((c) => [
          c.id ?? "—",
          c.label ?? "—",
          c.is_default ? "yes" : "no",
          c.inner_sleeve_type ?? "—",
          c.last_cleaned_at ?? "—",
        ]),
      );
    })(),
  );

  common(copies.command("add <release>").description("Add another physical copy"))
    .option("--label <text>", "Copy label")
    .option("--note <text>", "Copy notes")
    .action(async (release: string, opts: Common & { label?: string; note?: string }) =>
      handle(async () => {
        opts = copyOptions(opts);
        const result = await makeClient().createRecordCopy({
          friend_id: friendId(opts),
          release_id: release,
          label: opts.label,
          notes: opts.note,
        });
        if (opts.json) printJson(result);
        else console.log(`Added copy ${result.id} of ${release}.`);
      })(),
    );

  common(
    copies
      .command("label <release> <label>")
      .description("Label a copy; defaults to the release's default copy"),
  )
    .option("--copy <id>", "Physical copy ID", positiveInt)
    .action(async (release: string, label: string, opts: Common & { copy?: number }) =>
      handle(async () => {
        opts = copyOptions(opts);
        const client = makeClient();
        if (opts.copy) {
          const copies = await client.listRecordCopies(friendId(opts), release);
          if (!copies.some((copy) => copy.id === opts.copy)) {
            throw new Error(`Copy ${opts.copy} does not belong to release ${release}.`);
          }
        }
        const result = opts.copy
          ? await client.updateRecordCopy(opts.copy, { friend_id: friendId(opts), label })
          : await client.updateDefaultRecordCopy({
              friend_id: friendId(opts),
              release_id: release,
              label,
            });
        if (opts.json) printJson(result);
        else console.log(`Labeled copy ${result.id} of ${release}.`);
      })(),
    );

  common(copies.command("remove <id>").description("Soft-delete a physical copy")).action(
    async (id: string, opts: Common) =>
      handle(async () => {
        opts = copyOptions(opts);
        const result = await makeClient().deleteRecordCopy(positiveInt(id), friendId(opts));
        if (opts.json) printJson(result);
        else console.log(`Removed copy ${result.id}.`);
      })(),
  );

  common(records.command("history <copy-id>").description("Show a copy's care history"))
    .option("--include-voided", "Include voided actions")
    .option("--limit <n>", "Maximum actions", positiveInt, 50)
    .option("--offset <n>", "Actions to skip", boundedIntOption(0), 0)
    .action(
      async (
        id: string,
        opts: Common & { includeVoided?: boolean; limit: number; offset: number },
      ) =>
        handle(async () => {
          const result = await makeClient().listRecordActions(positiveInt(id), {
            friend_id: friendId(opts),
            include_voided: opts.includeVoided,
            limit: opts.limit,
            offset: opts.offset,
          });
          show(
            result,
            !!opts.json,
            ["ID", "Action", "When", "Method / sleeve", "Notes", "Voided"],
            result.items.map((a) => [
              a.id,
              a.action_type,
              a.occurred_at,
              a.sleeve_type ?? a.details.method ?? "—",
              a.notes ?? "—",
              a.voided_at ?? "—",
            ]),
          );
        })(),
    );

  common(records.command("void [action-id]").description("Void a mistaken care action or session"))
    .option("--session <id>", "Void a whole care session", positiveInt)
    .action(async (id: string | undefined, opts: Common & { session?: number }) =>
      handle(async () => {
        if ((id === undefined) === (opts.session === undefined)) {
          throw new Error("Give exactly one of an action ID or --session ID.");
        }
        const client = makeClient();
        if (opts.session) {
          const result = await client.voidRecordCareSession(opts.session, friendId(opts));
          if (opts.json) printJson(result);
          else {
            const { session } = result;
            console.log(
              `Voided session ${session.id} (${result.actions.length} actions)${
                session.stack_no && session.status === "open"
                  ? `; stack ${session.stack_no} is open again`
                  : ""
              }.`,
            );
          }
          return;
        }
        const result = await client.voidRecordAction(positiveInt(id!), friendId(opts));
        if (opts.json) printJson(result);
        else console.log(`Voided action ${result.action.id}.`);
      })(),
    );

  common(records.command("care").description("Find records that need care"))
    .option("--status <status>", "Care state", choice(careStatuses))
    .option("--overdue-days <n>", "Cleaning interval in days", positiveInt)
    .option("--needs-sleeve <type>", "Wanted inner sleeve", choice(sleeveTypes))
    .option("--summary", "Show counts by care state and sleeve type")
    .option("--limit <n>", "Maximum records", positiveInt, 50)
    .option("--offset <n>", "Records to skip", boundedIntOption(0), 0)
    .action(
      async (
        opts: Common & {
          status?: RecordCareStatus;
          overdueDays?: number;
          needsSleeve?: SleeveType;
          summary?: boolean;
          limit: number;
          offset: number;
        },
      ) =>
        handle(async () => {
          const client = makeClient();
          const query = {
            friend_id: friendId(opts),
            overdue_days: opts.overdueDays,
            needs_sleeve: opts.needsSleeve,
          };
          if (opts.summary) {
            const result = await client.getRecordCareSummary(query);
            show(
              result,
              !!opts.json,
              ["Care state", "Count"],
              [
                ["Total copies", result.total],
                ["Never cleaned", result.never_cleaned],
                ["Overdue", result.overdue],
                ["Needs sleeve", result.needs_sleeve],
                ...Object.entries(result.by_sleeve_type).map(([type, count]) => [
                  `Sleeve: ${type}`,
                  count,
                ]),
              ],
            );
          } else {
            const result = await client.listRecordCare({
              ...query,
              status: opts.status,
              limit: opts.limit,
              offset: opts.offset,
            });
            if (!opts.json) console.log(`${result.total} copy/copies found.`);
            show(
              result,
              !!opts.json,
              ["Release", "Album", "Artist", "Copy", "Sleeve", "Last cleaned"],
              result.items.map((c) => [
                c.release_id,
                c.album_title,
                c.album_artist,
                c.copy_id ?? "—",
                c.inner_sleeve_type ?? "—",
                c.last_cleaned_at ?? "—",
              ]),
            );
          }
        })(),
    );
}
