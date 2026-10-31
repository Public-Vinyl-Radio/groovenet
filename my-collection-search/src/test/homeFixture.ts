export const emptyHome = {
  counts: { tracks: 0, albums: 0, playlists: 0 },
  new_arrivals: { window_days: 30 as const, unrated_count: 0, items: [] },
  attention: { missing_audio: 0, missing_bpm_or_key: 0, due_for_cleaning: 0, failed_jobs: 0 },
  playlists: { draft_set: null, recent: [] },
};
