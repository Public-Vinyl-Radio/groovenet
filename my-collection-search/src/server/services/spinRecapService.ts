import type { SpinRecapQuery, SpinRecapResponse } from "@groovenet/contracts";
import { getDisplayTimeZone } from "@/server/config/timeZone";
import { spinRecapRepository, type RecapGroup } from "@/server/repositories/spinRecapRepository";

type Genre = SpinRecapResponse["genre_mix"]["current"][number];

function summarize(rows: RecapGroup[]) {
  return {
    spins: rows.reduce((sum, row) => sum + row.spins, 0),
    hours: rows.reduce((sum, row) => sum + (row.duration ?? 0) * row.spins, 0) / 3600,
    known: rows.reduce((sum, row) => sum + (row.duration === null ? 0 : row.spins), 0),
    records: new Set(rows.map((row) => row.release_id)).size,
  };
}

function genreMix(rows: RecapGroup[], total: number): Genre[] {
  const genres = new Map<string, Genre>();
  let other = 0;
  for (const row of rows) {
    if (!row.genres.length) other += row.spins;
    for (const genre of row.genres) {
      const entry = genres.get(genre.genre_id) ?? { ...genre, spins: 0, share: 0 };
      entry.spins += row.spins / row.genres.length;
      genres.set(genre.genre_id, entry);
    }
  }
  const sorted = [...genres.values()].sort(
    (a, b) => b.spins - a.spins || a.genre_id!.localeCompare(b.genre_id!),
  );
  other += sorted.slice(5).reduce((sum, genre) => sum + genre.spins, 0);
  return [...sorted.slice(0, 5), { genre_id: null, name: "Other", spins: other, share: 0 }].map(
    (genre) => ({ ...genre, share: total ? genre.spins / total : 0 }),
  );
}

function top<T extends { spins: number }>(map: Map<string, T>): T[] {
  return [...map.entries()]
    .sort(([a, x], [b, y]) => y.spins - x.spins || (a < b ? -1 : 1))
    .slice(0, 5)
    .map(([, value]) => value);
}

export const spinRecapService = {
  async getRecap(query: SpinRecapQuery): Promise<SpinRecapResponse> {
    const zone = getDisplayTimeZone();
    const [groups, first] = await Promise.all([
      spinRecapRepository.groups(query.friend_id, query.month, zone),
      spinRecapRepository.firstSpins(query.friend_id, query.month, zone),
    ]);
    // A stable order also chooses metadata deterministically when historical
    // snapshots differ for a track that has since left the collection.
    const current = groups.filter((row) => row.current);
    const previous = groups.filter((row) => !row.current);
    const now = summarize(current);
    const before = summarize(previous);
    const compare = (value: number, previous: number) => ({ value, previous });
    const split = { vinyl: 0, digital: 0 };
    const by_week = Array.from({ length: 5 }, (_, i) => ({ week: i + 1, vinyl: 0, digital: 0 }));
    const heatmap = Array.from({ length: 7 }, () => Array<number>(12).fill(0));
    const histogram = Array.from({ length: 12 }, (_, i) => ({
      from: 80 + i * 10,
      to: 90 + i * 10,
      spins: 0,
    }));
    const records = new Map<string, SpinRecapResponse["top_records"][number]>();
    const tracks = new Map<string, SpinRecapResponse["top_tracks"][number]>();
    const artists = new Map<string, SpinRecapResponse["top_artists"][number]>();
    const bpms = new Map<number, number>();
    for (const row of current) {
      split[row.medium] += row.spins;
      by_week[row.week - 1][row.medium] += row.spins;
      heatmap[row.weekday][row.block] += row.spins;
      const record = records.get(row.release_id) ?? {
        release_id: row.release_id,
        title: row.album,
        artist: row.record_artist,
        thumbnail: row.thumbnail,
        spins: 0,
      };
      record.spins += row.spins;
      records.set(row.release_id, record);
      const track = tracks.get(row.track_id) ?? {
        release_id: row.release_id,
        track_id: row.track_id,
        title: row.title,
        artist: row.artist,
        thumbnail: row.thumbnail,
        spins: 0,
      };
      track.spins += row.spins;
      tracks.set(row.track_id, track);
      const artist = artists.get(row.artist) ?? { artist: row.artist, spins: 0 };
      artist.spins += row.spins;
      artists.set(row.artist, artist);
      if (row.bpm !== null) {
        const bpm = Number(row.bpm);
        histogram[Math.max(0, Math.min(11, Math.floor((bpm - 80) / 10)))].spins += row.spins;
        bpms.set(bpm, (bpms.get(bpm) ?? 0) + row.spins);
      }
    }
    const bpmCount = [...bpms.values()].reduce((sum, count) => sum + count, 0);
    let seen = 0;
    let median = 0;
    for (const [bpm, count] of [...bpms.entries()].sort(([a], [b]) => a - b)) {
      for (const rank of [Math.floor((bpmCount - 1) / 2), Math.floor(bpmCount / 2)]) {
        if (rank >= seen && rank < seen + count) median += bpm / 2;
      }
      seen += count;
    }
    return {
      stats: {
        spins: compare(now.spins, before.spins),
        hours: compare(now.hours, before.hours),
        records_pulled: compare(now.records, before.records),
        new_to_rotation: compare(first.current, first.previous),
        hours_known_share: now.spins ? now.known / now.spins : 0,
        hours_known_spins: now.known,
      },
      split,
      by_week,
      genre_mix: {
        current: genreMix(current, now.spins),
        previous: genreMix(previous, before.spins),
      },
      top_records: top(records),
      top_tracks: top(tracks),
      top_artists: top(artists),
      heatmap,
      bpm: {
        histogram,
        median: bpmCount ? median : null,
        busiest: bpmCount
          ? [...histogram].sort((a, b) => b.spins - a.spins || a.from - b.from)[0]
          : null,
      },
    };
  },
};
