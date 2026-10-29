/** SQL only: callers supply trusted table aliases, never request input. */
export function effectiveAlbumValuesSql(
  alias: string,
  kind: "genres" | "styles",
  fallback = `${alias}.${kind}`,
): string {
  return `effective_album_taxonomy_values(${alias}.release_id::text, ${alias}.friend_id, '${kind}', ${fallback})`;
}

export function effectiveAlbumTaxonomySql(alias: string): string {
  return `${effectiveAlbumValuesSql(alias, "genres")} || ${effectiveAlbumValuesSql(alias, "styles")}`;
}

/** Keep source columns on Album; expose effective values and override state. */
export function albumTaxonomySelectSql(alias: string): string {
  return (["genres", "styles"] as const)
    .map(
      (kind) => `
    ${effectiveAlbumValuesSql(alias, kind)} AS effective_${kind},
    (SELECT ARRAY(
      SELECT l.genre_id::text FROM album_taxonomy_override_genres l
      WHERE l.release_id = o.release_id AND l.friend_id = o.friend_id AND l.kind = o.kind
      ORDER BY l.genre_id
    ) FROM album_taxonomy_overrides o
     WHERE o.release_id = ${alias}.release_id AND o.friend_id = ${alias}.friend_id AND o.kind = '${kind}')
    AS ${kind === "genres" ? "genre" : "style"}_override_ids
  `,
    )
    .join(",");
}
