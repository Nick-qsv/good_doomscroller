import { NextRequest, NextResponse } from "next/server";

import { isDatabaseConfigured, setDatabaseReaction } from "@/lib/database";
import { setDemoReaction } from "@/lib/demo-store";
import { actorIdentity, attachActorCookie } from "@/lib/identity";
import type { ReactionValue } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ passageId: string }> };

async function saveReaction(
  request: NextRequest,
  passageId: string,
  value: ReactionValue,
) {
  if (process.env.NODE_ENV === "production" && isDatabaseConfigured() && passageId.startsWith("demo-")) {
    return NextResponse.json({ error: "Passage not found." }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const identity = actorIdentity(request);

  try {
    const result = isDatabaseConfigured() && !passageId.startsWith("demo-")
      ? await setDatabaseReaction(identity.actorId, passageId, value)
      : setDemoReaction(identity.actorId, passageId, value);

    if (!result) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    const response = NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
    attachActorCookie(request, response, identity);
    return response;
  } catch (error) {
    console.error("Unable to save reaction", error);
    return NextResponse.json(
      { error: "Your reaction could not be saved. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { passageId } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON request body." }, { status: 400 });
  }

  const value =
    typeof body === "object" && body !== null && "value" in body
      ? (body as { value: unknown }).value
      : null;

  if (value !== 1 && value !== -1) {
    return NextResponse.json(
      { error: "Reaction value must be 1 or -1." },
      { status: 400 },
    );
  }

  return saveReaction(request, passageId, value);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { passageId } = await context.params;
  return saveReaction(request, passageId, 0);
}
