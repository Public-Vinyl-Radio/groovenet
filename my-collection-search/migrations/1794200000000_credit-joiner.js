/** The word or mark after a credited artist (`&`, `,`, `Featuring`), so a display string can be rebuilt from credits (#1078). */
export const up = (pgm) => {
  pgm.addColumns("album_artists", { joiner: { type: "text" } });
  pgm.addColumns("track_artists", { joiner: { type: "text" } });
};
export const down = (pgm) => {
  pgm.dropColumns("track_artists", ["joiner"]);
  pgm.dropColumns("album_artists", ["joiner"]);
};
