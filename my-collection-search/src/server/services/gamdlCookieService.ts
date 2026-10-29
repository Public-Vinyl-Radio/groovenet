import { deleteCookieFile, getCookieFileInfo, saveCookieFile } from "@/lib/cookieUtils";
import type { CookieFileInfo } from "@/types/gamdl";

export class GamdlCookieService {
  async getCookieFileInfo(): Promise<CookieFileInfo> {
    return getCookieFileInfo();
  }

  async uploadCookieFile(file: FormDataEntryValue | null): Promise<CookieFileInfo> {
    if (!(file instanceof File)) {
      throw new Error("No cookie file provided");
    }

    if (!file.name.endsWith(".txt") && !file.name.includes("cookie")) {
      throw new Error("Please upload a .txt cookie file");
    }

    return saveCookieFile(file);
  }

  async deleteCookieFile(): Promise<void> {
    await deleteCookieFile();
  }
}

export const gamdlCookieService = new GamdlCookieService();
