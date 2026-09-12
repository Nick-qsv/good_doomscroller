import { NextRequest, NextResponse } from "next/server";

import { getDatabaseFeed, isDatabaseConfigured } from "@/lib/database";
import { getDemoFeed } from "@/lib/demo-store";
import { actorIdentity, attachActorCookie } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function integerParameter(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export async function GET(request: NextRequest) {
  const cursor = integerParameter(request.nextUrl.searchParams.get("cursor"), 0, 1_000_000);
  const limit = Math.max(
    1,
    integerParameter(request.nextUrl.searchParams.get("limit"), 6, 20),
  );

  try {
    const identity = actorIdentity(request);
    let feed;
    if (isDatabaseConfigured()) {
      const databaseFeed = await getDatabaseFeed(identity.actorId, cursor, limit);
      // A freshly migrated local/AWS database is still a useful application. As
      // soon as the first curated passage is imported, the real feed takes over.
      feed =
        cursor === 0 && databaseFeed.items.length === 0
          ? getDemoFeed(identity.actorId, cursor, limit)
          : databaseFeed;
    } else {
      feed = getDemoFeed(identity.actorId, cursor, limit);
    }

    const response = NextResponse.json(feed, {
      headers: { "Cache-Control": "private, no-store" },
    });
    attachActorCookie(request, response, identity);
    return response;
  } catch (error) {
    console.error("Unable to load the passage feed", error);
    return NextResponse.json(
      { error: "The library is unavailable right now. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
