/**
 * Care sessions: stacks of copies cared for together, and where a log came
 * from (#941).
 *
 * `record_care_sessions` groups the actions of one batch log. The UI and CLI
 * call a session pulled from the queue a "stack": it has a per-friend
 * `stack_no` and starts `open`, while its copies are being cleaned. An ad-hoc
 * selection logged without pulling a stack is a session with `stack_no` null,
 * created already `logged`. Discarding an open stack (CLEAR) marks it
 * `discarded` and frees its number for the next pull.
 *
 * Undoing a log voids its actions (they stay as history) and stamps
 * `voided_at`; a stack goes back to `open`. Logging it again clears
 * `voided_at`.
 *
 * `record_care_session_items` is a stack's contents, so it can be reloaded by
 * number. `release_id` is always set; `copy_id` is null for a release's
 * implicit default copy, which becomes real when the stack is logged.
 *
 * `record_actions.source` is NOT NULL with default `api`, so every existing
 * row is backfilled as `api`: their origin was never recorded, and `api`
 * stands for "a caller that did not say". `session_id` is null for actions
 * logged one at a time, before or after this migration.
 */
const SOURCES = "'web', 'cli', 'mcp', 'api'";

export const up = (pgm) => {
  pgm.createTable("record_care_sessions", {
    id: { type: "serial", primaryKey: true },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    // Null for an ad-hoc selection that was not pulled as a stack.
    stack_no: { type: "integer" },
    source: { type: "varchar(8)", notNull: true, default: "api" },
    status: { type: "varchar(16)", notNull: true, default: "open" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    logged_at: { type: "timestamptz" },
    voided_at: { type: "timestamptz" },
  });

  pgm.addConstraint("record_care_sessions", "record_care_sessions_source_check", {
    check: `source IN (${SOURCES})`,
  });
  pgm.addConstraint("record_care_sessions", "record_care_sessions_status_check", {
    check: "status IN ('open', 'logged', 'discarded')",
  });
  // Only a stack waits open; an ad-hoc session is logged as it is created.
  pgm.addConstraint("record_care_sessions", "record_care_sessions_open_stack_check", {
    check: "status <> 'open' OR stack_no IS NOT NULL",
  });

  // Stack numbers are a per-friend sequence; a discarded stack gives its back.
  pgm.createIndex("record_care_sessions", ["friend_id", "stack_no"], {
    name: "idx_record_care_sessions_stack_no",
    unique: true,
    where: "stack_no IS NOT NULL AND status <> 'discarded'",
  });
  // One open stack per friend. Pulls serialise on an advisory lock; this is
  // the backstop.
  pgm.createIndex("record_care_sessions", ["friend_id"], {
    name: "idx_record_care_sessions_one_open",
    unique: true,
    where: "status = 'open'",
  });

  pgm.createTable("record_care_session_items", {
    session_id: {
      type: "integer",
      notNull: true,
      references: "record_care_sessions(id)",
      onDelete: "CASCADE",
    },
    position: { type: "integer", notNull: true },
    release_id: { type: "varchar(255)", notNull: true },
    // Null: the release's implicit default copy.
    copy_id: {
      type: "integer",
      references: "record_copies(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });
  pgm.addConstraint("record_care_session_items", "record_care_session_items_pkey", {
    primaryKey: ["session_id", "position"],
  });

  pgm.addColumns("record_actions", {
    session_id: {
      type: "integer",
      references: "record_care_sessions(id)",
      onDelete: "SET NULL",
    },
    source: { type: "varchar(8)", notNull: true, default: "api" },
  });
  pgm.addConstraint("record_actions", "record_actions_source_check", {
    check: `source IN (${SOURCES})`,
  });
  pgm.createIndex("record_actions", ["session_id"], {
    name: "idx_record_actions_session",
    where: "session_id IS NOT NULL",
  });
  // The care log feed pages a friend's actions newest first.
  pgm.createIndex("record_actions", ["friend_id", "occurred_at"], {
    name: "idx_record_actions_friend_occurred_at",
  });
};

export const down = (pgm) => {
  pgm.dropIndex("record_actions", ["friend_id", "occurred_at"], {
    name: "idx_record_actions_friend_occurred_at",
  });
  pgm.dropColumns("record_actions", ["session_id", "source"]);
  pgm.dropTable("record_care_session_items");
  pgm.dropTable("record_care_sessions");
};
