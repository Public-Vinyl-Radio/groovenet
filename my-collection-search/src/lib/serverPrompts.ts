import fs from "fs";
import path from "path";
import { settingsRepository } from "@/server/repositories/settingsRepository";

const PROMPT_PATH = path.join(process.cwd(), "content", "prompts", "track-metadata.txt");

let cachedDefaultPrompt: string | null = null;

export function getDefaultTrackMetadataPrompt(): string {
  if (cachedDefaultPrompt) return cachedDefaultPrompt;
  try {
    const text = fs.readFileSync(PROMPT_PATH, "utf-8").trim();
    cachedDefaultPrompt = text;
    return text;
  } catch (err) {
    console.error("Failed to read default prompt file:", err);
    return "You are a DJ music metadata assistant.";
  }
}

export async function getTrackMetadataPromptForFriend(friendId?: number): Promise<string> {
  const defaultPrompt = getDefaultTrackMetadataPrompt();
  if (!friendId || Number.isNaN(friendId)) return defaultPrompt;

  try {
    const prompt = await settingsRepository.findAiPromptByFriendId(friendId);
    return typeof prompt === "string" ? prompt : defaultPrompt;
  } catch (err) {
    console.error("Failed to fetch AI prompt settings:", err);
    return defaultPrompt;
  }
}
