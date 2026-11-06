// Shared fixtures for the Chores page's tests and stories (#943).
import type {
  RecordCareLogEntry,
  RecordCareProgressResponse,
  RecordCareQueueItem,
  RecordCareQueueResponse,
  RecordCareSession,
} from "@/services/internalApi/recordCare";

export const progressFixture: RecordCareProgressResponse = {
  cleaned: 10,
  total: 412,
  stack_size: 10,
  stacks_total: 42,
  stacks_done: 1,
  next_stack_no: 2,
  pace: null,
  this_month: { records: 11, sessions: 2 },
  by_sleeve_type: { original: 0, paper: 0, "poly-rice-paper-poly": 10, poly: 0, unknown: 402 },
};

export function queueItem(
  n: number,
  extra: Partial<RecordCareQueueItem> = {},
): RecordCareQueueItem {
  return {
    copy_id: null,
    release_id: `rel-${n}`,
    title: `Album ${n}`,
    artist: `Artist ${n}`,
    thumbnail: null,
    library_identifier: null,
    inner_sleeve_type: null,
    added_at: "2025-03-09T10:47:47Z",
    ...extra,
  };
}

export function queueFixture(
  overrides: {
    spun?: number[];
    fresh?: number[];
    backlog?: number[];
    backlogTotal?: number;
  } = {},
): RecordCareQueueResponse {
  const { spun = [1, 2], fresh = [3], backlog = [4, 5] } = overrides;
  return {
    spun_recently: {
      month: "2026-10",
      window_label: "OCT",
      items: spun.map((n) => ({
        ...queueItem(n),
        spin_count: n + 2,
        last_spin_at: "2026-10-20T20:00:00Z",
        window_label: "OCT",
      })),
    },
    new_arrivals: {
      window_days: 30,
      items: fresh.map((n) => queueItem(n, { added_at: "2026-10-17T16:25:39Z" })),
    },
    backlog: {
      items: backlog.map((n) => queueItem(n, { inner_sleeve_type: n === 5 ? "poly" : null })),
      total: overrides.backlogTotal ?? backlog.length,
      limit: 20,
      offset: 0,
    },
  };
}

export function stackFixture(releases: number[], stackNo = 2): RecordCareSession {
  return {
    id: 50,
    friend_id: 7,
    stack_no: stackNo,
    source: "web",
    status: "open",
    created_at: "2026-11-01T10:00:00Z",
    logged_at: null,
    voided_at: null,
    items: releases.map((n, position) => ({
      position,
      copy_id: null,
      release_id: `rel-${n}`,
      album_title: `Album ${n}`,
      album_artist: `Artist ${n}`,
      album_thumbnail: null,
      library_identifier: null,
      inner_sleeve_type: null,
      last_cleaned_at: null,
    })),
  };
}

export function logEntryFixture(extra: Partial<RecordCareLogEntry> = {}): RecordCareLogEntry {
  return {
    kind: "session",
    session_id: 60,
    action_id: null,
    stack_no: 1,
    source: "web",
    action_types: ["cleaned"],
    record_count: 10,
    method: null,
    sleeve_type: null,
    notes: null,
    occurred_at: "2026-11-01T18:09:00Z",
    voided: false,
    thumbnails: [],
    ...extra,
  };
}

/** The mockup's log: a CLI stack with a sleeve change, and one MCP inspection. */
export const careLogFixture: RecordCareLogEntry[] = [
  logEntryFixture({
    session_id: 62,
    stack_no: null,
    source: "mcp",
    action_types: ["inspected"],
    record_count: 1,
    notes: "Light scuff on side B, plays clean.",
    occurred_at: "2026-10-31T21:40:00Z",
  }),
  logEntryFixture({
    session_id: 61,
    source: "cli",
    action_types: ["cleaned", "sleeved"],
    method: "vacuum",
    sleeve_type: "poly-rice-paper-poly",
    notes: "Moved to poly / rice paper / poly.",
    occurred_at: "2026-10-28T19:15:00Z",
  }),
];
