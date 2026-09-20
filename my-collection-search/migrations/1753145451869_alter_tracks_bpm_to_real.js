export const shorthands = undefined;

export function up(pgm) {
  pgm.dropColumn("tracks", "bpm");
  pgm.addColumn("tracks", {
    bpm: {
      type: "real",
      default: null,
    },
  });
}

export function down(pgm) {
  pgm.dropColumn("tracks", "bpm");
  pgm.addColumn("tracks", {
    bpm: {
      type: "varchar(10)",
      default: null,
    },
  });
}
