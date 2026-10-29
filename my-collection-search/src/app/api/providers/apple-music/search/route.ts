import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const APPLE_MUSIC_API_URL = "https://api.music.apple.com/v1/catalog/us/search";

function generateAppleMusicDeveloperToken() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKeyRaw = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyRaw) {
    throw new Error(
      "Missing Apple Music credentials (APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, or APPLE_MUSIC_PRIVATE_KEY)",
    );
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180, // 6 months
  };
  const header = {
    alg: "ES256",
    kid: keyId,
  };
  return jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    header,
  });
}

interface SongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  url: string;
  artwork?: { url: string };
  durationInMillis?: number;
  isrc?: string;
}

interface Song {
  id: string;
  attributes: SongAttributes;
}

export async function POST(req: Request) {
  try {
    const { title, artist, album, isrc } = await req.json();
    const developerToken = generateAppleMusicDeveloperToken();
    // Build a query string with as much info as possible
    let query = `${title || ""} ${artist || ""}`.trim();
    if (album) query += ` ${album}`;
    let url = `${APPLE_MUSIC_API_URL}?term=${encodeURIComponent(query)}&types=songs&limit=10`;
    if (isrc) {
      // Try ISRC search first (if provided)
      url = `${APPLE_MUSIC_API_URL}?term=${encodeURIComponent(isrc)}&types=songs&limit=5`;
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${developerToken}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Apple Music API error" }, { status: 500 });
    }
    const data = await res.json();
    const songs: Song[] = data?.results?.songs?.data || [];
    // Optionally, filter by ISRC if provided
    let filtered = songs;
    if (isrc) {
      filtered = songs.filter(
        (song: Song) => song.attributes?.isrc?.toUpperCase() === isrc.toUpperCase(),
      );
    }
    // Map to a simple structure for the UI
    const results = filtered.map((song: Song) => ({
      id: song.id,
      title: song.attributes?.name,
      artist: song.attributes?.artistName,
      album: song.attributes?.albumName,
      url: song.attributes?.url,
      artwork: song.attributes?.artwork?.url,
      duration: song.attributes?.durationInMillis,
      isrc: song.attributes?.isrc,
    }));
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error searching Apple Music:", error);
    return NextResponse.json({ error: "Failed to search Apple Music" }, { status: 500 });
  }
}
