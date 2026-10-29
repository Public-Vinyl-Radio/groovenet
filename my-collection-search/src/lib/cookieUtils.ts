import { promises as fs } from "fs";
import * as path from "path";
import type { CookieFileInfo } from "@/types/gamdl";

/**
 * Parse cookie file and extract information
 */
export async function parseCookieFile(filePath: string): Promise<Partial<CookieFileInfo>> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() && !line.startsWith("#"));

    const domains = new Set<string>();
    const expiryDates: Date[] = [];
    let hasAppleMusic = false;
    const validationErrors: string[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 7) {
        const domain = parts[0];
        const expiryTimestamp = parseInt(parts[4]);

        domains.add(domain);

        // Normalize domain (strip leading dot)
        const normalizedDomain = domain.startsWith(".") ? domain.slice(1) : domain;
        if (
          normalizedDomain === "music.apple.com" ||
          normalizedDomain.endsWith(".music.apple.com")
        ) {
          hasAppleMusic = true;
        }

        if (!isNaN(expiryTimestamp) && expiryTimestamp > 0) {
          expiryDates.push(new Date(expiryTimestamp * 1000));
        }
      } else if (line.trim()) {
        validationErrors.push(`Invalid cookie format: ${line.substring(0, 50)}...`);
      }
    }

    // Check if cookies are expired
    const now = new Date();
    const expiredCount = expiryDates.filter((date) => date < now).length;
    if (expiredCount > 0) {
      validationErrors.push(`${expiredCount} cookies are expired`);
    }

    // Check if we have Apple Music cookies
    if (!hasAppleMusic) {
      validationErrors.push("No Apple Music cookies found");
    }

    return {
      domains: Array.from(domains),
      cookieCount: lines.length,
      hasAppleMusic,
      expiryDates,
      isValid: validationErrors.length === 0,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };
  } catch (error) {
    return {
      isValid: false,
      validationErrors: [
        `Failed to parse cookie file: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * Get information about the current cookie file
 */
export async function getCookieFileInfo(): Promise<CookieFileInfo> {
  const cookieDir = path.join(process.cwd(), "cookies");
  const cookieFile = path.join(cookieDir, "gamdl_cookies.txt");

  try {
    const stats = await fs.stat(cookieFile);
    const parseInfo = await parseCookieFile(cookieFile);

    return {
      exists: true,
      filename: "gamdl_cookies.txt",
      size: stats.size,
      lastModified: stats.mtime,
      ...parseInfo,
    };
  } catch (error) {
    return {
      exists: false,
      isValid: false,
      validationErrors: [
        `Cookie file not found: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

/**
 * Save uploaded cookie file
 */
export async function saveCookieFile(file: File): Promise<CookieFileInfo> {
  const cookieDir = path.join(process.cwd(), "cookies");
  const cookieFile = path.join(cookieDir, "gamdl_cookies.txt");

  // Ensure cookies directory exists
  await fs.mkdir(cookieDir, { recursive: true });

  // Read and validate the uploaded file
  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("utf-8");

  // Basic validation
  if (!content.trim()) {
    throw new Error("Cookie file is empty");
  }

  // Save to temporary location first for validation
  const tempFile = `${cookieFile}.tmp`;
  await fs.writeFile(tempFile, buffer);

  try {
    // Parse and validate
    const parseInfo = await parseCookieFile(tempFile);

    if (!parseInfo.isValid && parseInfo.validationErrors) {
      throw new Error(`Invalid cookie file: ${parseInfo.validationErrors.join(", ")}`);
    }

    // If validation passes, move to final location
    await fs.rename(tempFile, cookieFile);

    // Return updated info
    return await getCookieFileInfo();
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempFile);
    } catch {}
    throw error;
  }
}

/**
 * Delete the current cookie file
 */
export async function deleteCookieFile(): Promise<void> {
  const cookieDir = path.join(process.cwd(), "cookies");
  const cookieFile = path.join(cookieDir, "gamdl_cookies.txt");

  try {
    await fs.unlink(cookieFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
    // File doesn't exist, which is fine
  }
}
