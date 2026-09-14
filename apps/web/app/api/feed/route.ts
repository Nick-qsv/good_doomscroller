import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getDatabaseFeed, isDatabaseConfigured } from "@/lib/database";
import { getDemoFeed } from "@/lib/demo-store";
import { actorIdentity, attachActorCookie } from "@/lib/identity";
import type { FeedFilters } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function integerParameter(value: string | null, fallback: number, maximum: number) {
  if (value === null || !/^\d{1,10}$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export async function GET(request: NextRequest) {
  const suppliedBook = request.nextUrl.searchParams.get("book") || undefined;
  const suppliedTheme = request.nextUrl.searchParams.get("theme") || undefined;
  if ((suppliedBook && !/^[a-z0-9_-]{1,128}$/i.test(suppliedBook))
    || (suppliedTheme && (suppliedTheme.length > 128 || /[\u0000-\u001f\u007f]/.test(suppliedTheme)))) {
    return NextResponse.json({ error: "Invalid book or theme filter." }, {
      status: 400, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const filters: FeedFilters = {
    ...(suppliedBook ? { bookId: suppliedBook.toLowerCase() } : {}),
    ...(suppliedTheme ? { theme: suppliedTheme } : {}),
  };
  const suppliedCursor = request.nextUrl.searchParams.get("cursor");
  const isUuid = suppliedCursor !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suppliedCursor);
  // Old clients sent numeric offsets. Treat these as new visits while rolling
  // out the opaque page cursors used by the current client.
  if (suppliedCursor !== null && !isUuid && !/^\d{1,7}$/.test(suppliedCursor)) {
    return NextResponse.json({ error: "Invalid feed cursor." }, {
      status: 400, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const cursor = isUuid ? suppliedCursor!.toLowerCase() : randomUUID();
  const limit = Math.max(
    1,
    integerParameter(request.nextUrl.searchParams.get("limit"), 6, 20),
  );

  try {
    const identity = actorIdentity(request);
    let feed;
    if (isDatabaseConfigured()) {
      const databaseFeed = await getDatabaseFeed(identity.actorId, cursor, limit, filters);
      // A freshly migrated local/AWS database is still a useful application. As
      // soon as the first curated passage is imported, the real feed takes over.
      feed =
        databaseFeed.totalPublished === 0
          ? getDemoFeed(identity.actorId, cursor, limit, filters)
          : databaseFeed;
    } else {
      feed = getDemoFeed(identity.actorId, cursor, limit, filters);
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
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
