/**
 * Which version of the identity/audio-vibe text template produced a row
 * (#382). Nothing reads or compares it yet — it's the hook #382's re-embed
 * job will need to find rows stale after a template rewrite, since
 * `source_hash` only tells us the track's *data* changed, not that the
 * template code generating the text from that data did.
 */
export const up = (pgm) => {
  pgm.addColumns("track_embeddings", {
    template_version: { type: "integer", notNull: true, default: 1 },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("track_embeddings", ["template_version"]);
};
