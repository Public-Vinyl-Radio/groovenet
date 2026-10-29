import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

function normalizeFilenameInput(raw: string): string {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // ignore malformed encoding and use raw value
  }

  // Support legacy values that stored the full audio URL.
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const nested = parsed.searchParams.get("filename");
      if (nested) value = nested;
      else value = path.basename(parsed.pathname);
    } catch {
      // keep original value
    }
  }

  value = value.replace(/^\/+/, "");
  value = value.replace(/^app\/audio\//, "");
  value = value.replace(/^audio\//, "");
  return value;
}

function resolveAudioPath(audioDir: string, input: string): string | null {
  const normalized = normalizeFilenameInput(input);
  if (!normalized) return null;

  const primary = path.resolve(audioDir, normalized);
  const audioRoot = path.resolve(audioDir);
  // turbopackIgnore comments: these paths point at the runtime /app/audio
  // volume (user data), not project files — opt out of build-time tracing so
  // Next doesn't include the whole project in the standalone output.
  if (
    primary.startsWith(audioRoot) &&
    fs.existsSync(/* turbopackIgnore: true */ primary) &&
    fs.statSync(/* turbopackIgnore: true */ primary).isFile()
  ) {
    return primary;
  }

  // Backward compatibility: if input contains stale prefixes/paths, try basename.
  const base = path.basename(normalized);
  const fallback = path.resolve(audioDir, base);
  if (
    fallback.startsWith(audioRoot) &&
    fs.existsSync(/* turbopackIgnore: true */ fallback) &&
    fs.statSync(/* turbopackIgnore: true */ fallback).isFile()
  ) {
    return fallback;
  }

  return null;
}

export async function GET(request: Request) {
  const range = request.headers.get("range");
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");
  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  const audioDir = process.env.AUDIO_DIR || "/app/audio";
  const filePath = resolveAudioPath(audioDir, filename);
  if (!filePath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(/* turbopackIgnore: true */ filePath);
  const totalSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  let contentType = "audio/mpeg";
  if (ext === ".wav") contentType = "audio/wav";
  if (ext === ".m4a") contentType = "audio/mp4";

  // If no Range header, just stream the whole file
  if (!range) {
    const nodeStream = fs.createReadStream(/* turbopackIgnore: true */ filePath);
    const readableStream = new ReadableStream({
      start(ctrl) {
        function cleanup() {
          nodeStream.removeAllListeners("data");
          nodeStream.removeAllListeners("end");
          nodeStream.removeAllListeners("error");
        }
        nodeStream.on("data", (chunk) => {
          try {
            ctrl.enqueue(chunk);
          } catch {
            cleanup();
            nodeStream.destroy();
          }
        });
        nodeStream.once("end", () => {
          cleanup();
          try {
            ctrl.close();
          } catch {}
        });
        nodeStream.once("error", (err) => {
          cleanup();
          try {
            ctrl.error(err);
          } catch {}
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });
    return new Response(readableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": totalSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  // Parse "bytes=start-end"
  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  let end = endStr ? parseInt(endStr, 10) : totalSize - 1;

  // Validate and clamp range values
  if (isNaN(start) || start < 0) {
    return NextResponse.json({ error: "Invalid range start" }, { status: 416 });
  }
  if (start >= totalSize) {
    return NextResponse.json({ error: "Range start beyond file size" }, { status: 416 });
  }

  // Clamp end to valid range
  end = Math.min(end, totalSize - 1);

  // Ensure start <= end
  if (start > end) {
    return NextResponse.json({ error: "Invalid range: start > end" }, { status: 416 });
  }

  const chunkSize = end - start + 1;

  // Create a stream for just the requested range
  const nodeStream = fs.createReadStream(/* turbopackIgnore: true */ filePath, {
    start,
    end,
  });
  const readableStream = new ReadableStream({
    start(ctrl) {
      function cleanup() {
        nodeStream.removeAllListeners("data");
        nodeStream.removeAllListeners("end");
        nodeStream.removeAllListeners("error");
      }
      nodeStream.on("data", (chunk) => {
        try {
          ctrl.enqueue(chunk);
        } catch {
          cleanup();
          nodeStream.destroy();
        }
      });
      nodeStream.once("end", () => {
        cleanup();
        try {
          ctrl.close();
        } catch {}
      });
      nodeStream.once("error", (err) => {
        cleanup();
        try {
          ctrl.error(err);
        } catch {}
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(readableStream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": chunkSize.toString(),
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
