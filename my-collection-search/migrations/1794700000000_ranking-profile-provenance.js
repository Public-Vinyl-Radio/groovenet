export const up = (pgm) => {
  pgm.addColumns("ranking_profiles", {
    source_handle: { type: "varchar(64)" },
    author: { type: "varchar(64)" },
    origin: { type: "text", check: "origin IN ('file', 'friend')" },
  });
};
export const down = (pgm) =>
  pgm.dropColumns("ranking_profiles", ["author", "origin", "source_handle"], { ifExists: true });
