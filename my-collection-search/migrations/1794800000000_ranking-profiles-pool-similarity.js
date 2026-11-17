/**
 * Ranking schema version 2 (#1218): the similarity signals are ranked within
 * the candidate pool, so a stored profile's identity and vibe weights now
 * mean "best to worst in the pool" rather than scaling a raw `1 − d/2`.
 *
 * The weights are kept as they are. No rescaling reproduces a raw-similarity
 * ranking on ranks, and a row left at version 1 would no longer parse, so it
 * would rank as Default and the editor would show Default's weights instead
 * of its own. Moving the version on keeps every profile usable and editable;
 * an imported v1 file takes the same step and warns.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql("UPDATE ranking_profiles SET version = 2 WHERE version = 1");
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.sql("UPDATE ranking_profiles SET version = 1 WHERE version = 2");
};
