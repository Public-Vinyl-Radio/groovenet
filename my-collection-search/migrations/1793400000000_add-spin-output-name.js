/** Snapshot the output a digital play was heard on, including queued deliveries. */
export const up = (pgm) => {
  pgm.addColumn("spin_sessions", { output_name: { type: "text" } });
  pgm.addColumn("server_player_plays", { output_name: { type: "text" } });
};

export const down = (pgm) => {
  pgm.dropColumn("server_player_plays", "output_name");
  pgm.dropColumn("spin_sessions", "output_name");
};
