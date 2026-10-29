/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Migration: Add CASCADE delete to albums.friend_id foreign key
 *
 * This migration updates the foreign key constraint on albums.friend_id
 * to include ON DELETE CASCADE, allowing albums to be automatically deleted
 * when their associated friend is removed.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Drop the existing foreign key constraint
  pgm.dropConstraint("albums", "albums_friend_id_fkey", {
    ifExists: true,
  });

  // Re-add the foreign key constraint with CASCADE delete
  pgm.addConstraint("albums", "albums_friend_id_fkey", {
    foreignKeys: {
      columns: "friend_id",
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop the CASCADE constraint
  pgm.dropConstraint("albums", "albums_friend_id_fkey", {
    ifExists: true,
  });

  // Re-add the original constraint without CASCADE
  pgm.addConstraint("albums", "albums_friend_id_fkey", {
    foreignKeys: {
      columns: "friend_id",
      references: "friends(id)",
    },
  });
};
