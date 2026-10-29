import { NextResponse } from "next/server";

type YouTubeSearchItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: {
      default?: { url: string };
    };
  };
};

export async function POST(req: Request) {
  try {
    const { title, artist } = await req.json();
    const query = [title, artist].filter(Boolean).join(" ");
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing YOUTUBE_API_KEY env variable" }, { status: 500 });
    }
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(
      query,
    )}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    const videos = (data.items || []).map((item: YouTubeSearchItem) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.default?.url,
    }));
    return NextResponse.json({ results: videos });
  } catch (error) {
    console.error("Error searching YouTube:", error);
    return NextResponse.json({ error: "YouTube search failed" }, { status: 500 });
  }
}
