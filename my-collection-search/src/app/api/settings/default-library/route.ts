import { NextResponse } from "next/server";
import {
  defaultLibrarySettingsGetResponseSchema,
  defaultLibrarySettingsPutBodySchema,
  defaultLibrarySettingsPutResponseSchema,
} from "@/api-contract/schemas";
import { settingsService } from "@/server/services/settingsService";

type PgLikeError = Error & {
  code?: string;
  constraint?: string;
};

export async function GET() {
  try {
    const result = await settingsService.getDefaultLibrary();
    return NextResponse.json(defaultLibrarySettingsGetResponseSchema.parse(result));
  } catch (err) {
    console.error("Failed to load default library settings:", err);

    const error = err as PgLikeError;
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          error: "default_library_settings table is missing. Run migrations first.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "Failed to load default library settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = defaultLibrarySettingsPutBodySchema.safeParse({
      friend_id: Number(body?.friend_id),
    });

    if (!parsed.success || parsed.data.friend_id === 0) {
      return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
    }

    const result = await settingsService.updateDefaultLibrary(parsed.data.friend_id);
    return NextResponse.json(defaultLibrarySettingsPutResponseSchema.parse(result));
  } catch (err) {
    console.error("Failed to update default library settings:", err);

    const error = err as PgLikeError;
    if (error.message.includes("does not exist")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          error: "default_library_settings table is missing. Run migrations first.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update default library settings" },
      { status: 500 },
    );
  }
}
