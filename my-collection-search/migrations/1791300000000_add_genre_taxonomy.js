import { genreAliasSeed, genreSeed, genreStyleSeed } from "../src/server/genres/taxonomySeed.js";

export const shorthands = undefined;

function normalizeGenreName(value) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function genreSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function insertGenreSql({ name, source, parentName = null }) {
  const parentId = parentName
    ? `(SELECT id FROM genres WHERE normalized_name = ${sqlLiteral(normalizeGenreName(parentName))})`
    : "NULL";

  return `
    INSERT INTO genres (name, normalized_name, slug, parent_id, source)
    VALUES (
      ${sqlLiteral(name)},
      ${sqlLiteral(normalizeGenreName(name))},
      ${sqlLiteral(genreSlug(name))},
      ${parentId},
      ${sqlLiteral(source)}
    )
    ON CONFLICT (normalized_name) DO NOTHING;
  `;
}

/**
 * Canonical, global taxonomy for DJ-facing track genres.
 *
 * `normalized_name` is the uniqueness and lookup key rather than relying on
 * database collation. It is deliberately produced by the same algorithm as
 * src/lib/genres/normalization.ts. Keep both in sync: a raw value must resolve
 * to the same entry in an API request and in this seed.
 */
export const up = (pgm) => {
  pgm.createTable("genres", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    name: {
      type: "text",
      notNull: true,
    },
    normalized_name: {
      type: "text",
      notNull: true,
    },
    slug: {
      type: "text",
      notNull: true,
    },
    parent_id: {
      type: "uuid",
      references: "genres(id)",
      onDelete: "RESTRICT",
    },
    source: {
      type: "varchar(20)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("genres", "genres_normalized_name_key", {
    unique: "normalized_name",
  });
  pgm.addConstraint("genres", "genres_slug_key", { unique: "slug" });
  pgm.addConstraint("genres", "genres_source_check", {
    check: "source IN ('discogs', 'custom')",
  });
  pgm.addConstraint("genres", "genres_no_self_parent", {
    check: "parent_id IS NULL OR parent_id <> id",
  });
  pgm.createIndex("genres", "parent_id", { name: "idx_genres_parent_id" });

  pgm.createTable("genre_aliases", {
    alias_normalized: {
      type: "text",
      primaryKey: true,
    },
    genre_id: {
      type: "uuid",
      notNull: true,
      references: "genres(id)",
      onDelete: "CASCADE",
    },
    source: {
      type: "varchar(20)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("genre_aliases", "genre_aliases_source_check", {
    check: "source IN ('seed', 'reconciliation', 'manual')",
  });
  pgm.createIndex("genre_aliases", "genre_id", { name: "idx_genre_aliases_genre_id" });

  // Insert roots before children so every child parent lookup succeeds. The
  // conflict guards make the seed safe to invoke again without rewriting any
  // taxonomy decisions made after the initial migration.
  for (const genre of genreSeed) pgm.sql(insertGenreSql(genre));
  for (const genre of genreStyleSeed) pgm.sql(insertGenreSql(genre));

  for (const alias of genreAliasSeed) {
    pgm.sql(`
      INSERT INTO genre_aliases (alias_normalized, genre_id, source)
      VALUES (
        ${sqlLiteral(normalizeGenreName(alias.alias))},
        (SELECT id FROM genres WHERE normalized_name = ${sqlLiteral(
          normalizeGenreName(alias.genreName)
        )}),
        ${sqlLiteral(alias.source)}
      )
      ON CONFLICT (alias_normalized) DO NOTHING;
    `);
  }
};

export const down = (pgm) => {
  pgm.dropTable("genre_aliases");
  pgm.dropTable("genres");
};
