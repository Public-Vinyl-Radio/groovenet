import { getCookieFileInfo } from "@/lib/cookieUtils";
import type { GamdlConnectionTestDetails, GamdlConnectionTestResult } from "@/types/gamdl";

function getErrorTypeFromCookieDetails(
  details: GamdlConnectionTestDetails,
  validationErrors?: string[],
  hasAppleMusic?: boolean,
): string | undefined {
  if (!details.cookie_file_exists) {
    return "cookie_file_not_found";
  }

  if (!details.cookie_file_valid) {
    if (hasAppleMusic === false) {
      return "no_apple_cookies";
    }

    if (validationErrors?.some((error) => error.toLowerCase().includes("invalid cookie format"))) {
      return "invalid_cookie_format";
    }
  }

  return undefined;
}

function getMessageFromDetails(details: GamdlConnectionTestDetails): string {
  if (details.gamdl_available && details.cookie_file_exists && details.cookie_file_valid) {
    return "Gamdl is properly configured and ready to use";
  }

  if (!details.gamdl_available) {
    return "Gamdl is not available or not properly installed";
  }

  if (!details.cookie_file_exists) {
    return "Cookie file is missing - please upload your Apple Music cookies";
  }

  if (!details.cookie_file_valid) {
    if (details.error_type === "no_apple_cookies") {
      return "Cookie file doesn't contain Apple Music cookies";
    }

    if (details.error_type === "invalid_cookie_format") {
      return "Cookie file format is invalid";
    }

    return "Cookie file validation failed";
  }

  return "Unknown configuration issue";
}

export class GamdlConnectionTestService {
  async testConnection(): Promise<GamdlConnectionTestResult> {
    const details: GamdlConnectionTestDetails = {
      gamdl_available: true,
      cookie_file_exists: false,
      cookie_file_valid: false,
      test_download_attempted: false,
      test_download_success: false,
    };

    const cookieInfo = await getCookieFileInfo();
    details.cookie_file_exists = Boolean(cookieInfo.exists && (cookieInfo.size ?? 0) > 0);
    details.cookie_file_valid = Boolean(cookieInfo.exists && cookieInfo.isValid);
    details.error_type = getErrorTypeFromCookieDetails(
      details,
      cookieInfo.validationErrors,
      cookieInfo.hasAppleMusic,
    );

    const success =
      details.gamdl_available && details.cookie_file_exists && details.cookie_file_valid;

    return {
      success,
      message: getMessageFromDetails(details),
      details,
    };
  }
}

export const gamdlConnectionTestService = new GamdlConnectionTestService();
