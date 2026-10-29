import { NextResponse } from "next/server";
import { TextEncoder } from "util";
import {
  friendDeleteQuerySchema,
  friendMutationBodySchema,
  friendMutationResponseSchema,
  friendsListResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { friendService } from "@/server/services/friendService";

export async function GET() {
  try {
    const results = await friendService.listFriends();
    return NextResponse.json(friendsListResponseSchema.parse({ results }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = friendMutationBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid username" }, { status: 400 });
    }
    const { username } = parsed.data;

    await friendService.addFriend(username);

    analytics.track("friend_added", {}, { request });

    return NextResponse.json(
      friendMutationResponseSchema.parse({ message: `Friend '${username}' added.` }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) => {
        controller.enqueue(encoder.encode(`${line}\n`));
      };

      try {
        const url = new URL(request.url);
        const parsed = friendDeleteQuerySchema.safeParse({
          username: url.searchParams.get("username") ?? undefined,
        });
        if (!parsed.success) {
          send("Missing or invalid username");
          controller.close();
          return;
        }
        const { username } = parsed.data;

        await friendService.removeFriend(username, send);

        analytics.track("friend_removed", {}, { request });

        send("DONE");
        controller.close();
      } catch (error) {
        send(`Error: ${error instanceof Error ? error.message : String(error)}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Transfer-Encoding": "chunked",
    },
    status: 200,
  });
}
