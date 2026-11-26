export const shorthands = undefined;

export function up(pgm) {
  pgm.dropColumn("gamdl_settings", "audio_format");
  pgm.addColumns("gamdl_settings", {
    sample_rate_cap: { type: "integer", notNull: true, default: 48000 },
    lossless_fallback: { type: "boolean", notNull: true, default: true },
  });
  pgm.addConstraint(
    "gamdl_settings",
    "gamdl_sample_rate_cap",
    "CHECK (sample_rate_cap IN (44100, 48000, 96000, 192000))",
  );
}

export function down(pgm) {
  pgm.dropConstraint("gamdl_settings", "gamdl_sample_rate_cap");
  pgm.dropColumns("gamdl_settings", ["sample_rate_cap", "lossless_fallback"]);
  pgm.addColumns("gamdl_settings", {
    audio_format: { type: "varchar(10)", notNull: true, default: "m4a" },
  });
}
