import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/album-covers");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function saveAlbumCover(file: File): Promise<string> {
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type. Only JPEG, PNG, and WebP allowed.");
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large. Maximum size is 5MB.");
  }

  // Ensure directory exists
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Generate unique filename
  const ext = file.type.split("/")[1];
  const filename = `${uuidv4()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // Save file
  const buffer = await file.arrayBuffer();
  await fs.writeFile(filepath, Buffer.from(buffer));

  // Return public URL path
  return `/uploads/album-covers/${filename}`;
}
