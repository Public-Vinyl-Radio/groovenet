export type Artist = {
  id: number;
  name: string;
  sort_name: string;
  slug: string;
  discogs_artist_id: string | null;
  apple_artist_id: string | null;
  is_placeholder: boolean;
  created_at: Date;
  updated_at: Date;
};

export type NewArtist = Pick<Artist, "name" | "sort_name" | "slug"> &
  Partial<Pick<Artist, "discogs_artist_id" | "apple_artist_id" | "is_placeholder">>;

export type ArtistAlias = { alias: string; alias_normalized: string; artist_id: number };
export type ArtistCredit = {
  artist_id: number;
  role: "primary" | "featured" | "remixer" | "composer";
  position: number;
  credited_as: string;
  joiner?: string | null;
  source: "discogs" | "apple" | "legacy" | "manual";
};
