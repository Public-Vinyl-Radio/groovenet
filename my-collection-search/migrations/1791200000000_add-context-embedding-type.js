/**
 * A third embedding kind, `context`, for natural-language retrieval (#408).
 *
 * Its own migration because Postgres won't let a transaction use an enum
 * value it added: the settings row and partial index that name 'context'
 * follow in the next migration, once this one has committed.
 */
export const shorthands = undefined;

export const up = (pgm) => {
  // node-pg-migrate otherwise runs every pending migration in one transaction,
  // which would make 'context' unusable by the next migration too.
  pgm.noTransaction();
  pgm.sql(`ALTER TYPE embedding_type_enum ADD VALUE IF NOT EXISTS 'context';`);
};

// Postgres can't drop an enum value. An unused 'context' label is harmless,
// and `ADD VALUE IF NOT EXISTS` makes re-applying this a no-op.
export const down = () => {};
