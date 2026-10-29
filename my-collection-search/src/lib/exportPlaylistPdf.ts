import jsPDF from "jspdf";
import type { Track } from "@/types/track";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import { httpArrayBuffer } from "@/services/http";

const MONO_TTF_PATH = "/NotoSansMono-Regular.ttf";
const MONO_TTF_VFS = "NotoSansMono-Regular.ttf";
const MONO_FONT_NAME = "NotoSansMono";
let monoLoadPromise: Promise<void> | null = null;
let monoBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ensureMonoFont(doc: jsPDF): Promise<void> {
  if (!monoLoadPromise) {
    monoLoadPromise = (async () => {
      try {
        const buffer = await httpArrayBuffer(MONO_TTF_PATH);
        monoBase64 = arrayBufferToBase64(buffer);
      } catch {
        // Fall back to built-in font if PT Mono isn't available
      }
    })();
  }
  await monoLoadPromise;
  if (monoBase64) {
    try {
      doc.addFileToVFS(MONO_TTF_VFS, monoBase64);
      doc.addFont(MONO_TTF_VFS, MONO_FONT_NAME, "normal");
    } catch {
      // Ignore and fall back
    }
  }
  try {
    doc.setFont(MONO_FONT_NAME, "normal");
  } catch {
    doc.setFont("courier", "normal");
  }
}

function truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = "...";
  if (doc.getTextWidth(ellipsis) > maxWidth) return "";

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (doc.getTextWidth(candidate) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, low) + ellipsis;
}

function sanitizeForPdf(value: unknown): string {
  const text = String(value ?? "");
  // Normalize whitespace; keep full Unicode for supported fonts.
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Exports a playlist to PDF using jsPDF.
 * @param playlist The playlist array (all tracks)
 * @param displayPlaylist The display playlist (may be reordered or filtered)
 * @param totalPlaytimeFormatted The formatted total playtime string
 * @param playlistName Optional playlist name to render in header
 * @param exportedAt Optional timestamp string to render in header
 * @param filename The filename for the PDF (default: "playlist.pdf")
 */
export async function exportPlaylistToPDF({
  playlist,
  totalPlaytimeFormatted,
  playlistName,
  exportedAt,
  filename = "playlist.pdf",
}: {
  playlist: Track[];
  totalPlaytimeFormatted: string;
  playlistName?: string;
  exportedAt?: string;
  filename?: string;
}) {
  if (!playlist.length) return;
  const doc = new jsPDF({ orientation: "landscape" });
  await ensureMonoFont(doc);

  const marginLeft = 10;
  const marginTop = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rowHeight = 4;
  const headerGap = 6;
  const headerY = marginTop + 12;
  const tableTopY = headerY + headerGap;
  const maxY = pageHeight - 12;
  const footerText = "Exported via GrooveNET. The future of vinyl.";
  const footerY = pageHeight - 6;

  const headerTitle = playlistName ? sanitizeForPdf(playlistName) : "Playlist";
  const headerTimestamp = exportedAt ? sanitizeForPdf(exportedAt) : null;

  doc.setLineHeightFactor(1);
  doc.setFontSize(12);
  doc.text(headerTitle, marginLeft, marginTop);
  doc.setFontSize(8);
  doc.text(`Total Tracks: ${playlist.length}`, marginLeft, marginTop + 4);
  doc.text(`Total Playtime: ${totalPlaytimeFormatted}`, marginLeft, marginTop + 7);
  if (headerTimestamp) {
    doc.text(`Exported: ${headerTimestamp}`, marginLeft, marginTop + 10);
  }

  const columns = [
    { key: "#", label: "#", width: 6 },
    { key: "id", label: "ID", width: 20 },
    { key: "pos", label: "Pos", width: 8 },
    { key: "artist", label: "Artist", width: 50 },
    { key: "title", label: "Title", width: 60 },
    { key: "album", label: "Album", width: 60 },
    { key: "bpm", label: "BPM", width: 10 },
    { key: "key", label: "Key", width: 16 },
    { key: "dur", label: "Dur", width: 10 },
    { key: "genre", label: "Genre", width: 30 },
  ];

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const availableWidth = pageWidth - marginLeft * 2;
  if (totalWidth > availableWidth) {
    const scale = availableWidth / totalWidth;
    columns.forEach((col) => {
      col.width = Math.floor(col.width * scale);
    });
  }

  const getXPositions = (): number[] => {
    const xs: number[] = [marginLeft];
    for (let i = 0; i < columns.length - 1; i += 1) {
      xs.push(xs[i] + columns[i].width);
    }
    return xs;
  };

  const xPositions = getXPositions();

  const renderHeader = (y: number) => {
    columns.forEach((col, idx) => {
      doc.text(col.label, xPositions[idx], y);
    });
    doc.line(marginLeft, y + 1, marginLeft + availableWidth, y + 1);
  };
  const renderFooter = () => {
    doc.text(footerText, marginLeft, footerY);
  };

  let y = tableTopY;
  renderHeader(y);
  y += rowHeight;

  playlist.forEach((track, idx) => {
    if (y > maxY) {
      renderFooter();
      doc.addPage();
      y = marginTop;
      doc.setFontSize(12);
      doc.text(headerTitle, marginLeft, y);
      doc.setFontSize(8);
      doc.text(`Total Tracks: ${playlist.length}`, marginLeft, y + 4);
      doc.text(`Total Playtime: ${totalPlaytimeFormatted}`, marginLeft, y + 7);
      if (headerTimestamp) {
        doc.text(`Exported: ${headerTimestamp}`, marginLeft, y + 10);
      }
      y = tableTopY;
      renderHeader(y);
      y += rowHeight;
    }

    const indexStr = sanitizeForPdf(`${idx + 1}`);
    const position = sanitizeForPdf(
      track.position !== undefined && track.position !== null ? String(track.position) : "-",
    );
    const artist = sanitizeForPdf(track.artist || "Unknown Artist");
    const title = sanitizeForPdf(track.title || "Untitled");
    const album = sanitizeForPdf(track.album || "");
    const id = sanitizeForPdf(track.library_identifier || "");
    const bpm = sanitizeForPdf(track.bpm || "-");
    const key = sanitizeForPdf(track.key || "-");
    const durSeconds = getTrackDurationSeconds(track);
    const dur = sanitizeForPdf(durSeconds ? formatSeconds(durSeconds) : "-");
    const genre = sanitizeForPdf(Array.isArray(track.genres) ? track.genres.join(", ") : "");

    const rowValues = [indexStr, id, position, artist, title, album, bpm, key, dur, genre];

    rowValues.forEach((value, colIdx) => {
      const maxWidth = columns[colIdx].width - 1;
      const displayValue = truncateToWidth(doc, String(value), maxWidth);
      doc.text(displayValue, xPositions[colIdx], y);
    });

    y += rowHeight;
  });
  renderFooter();
  doc.save(filename);
}
