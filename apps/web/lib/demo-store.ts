import { demoPassages } from "@/lib/demo-data";
import type {
  FeedPassage,
  FeedResponse,
  ReactionResponse,
  ReactionValue,
} from "@/lib/types";

type ReactionMap = Map<string, Map<string, Exclude<ReactionValue, 0>>>;

declare global {
  var __goodDoomscrollerDemoReactions: ReactionMap | undefined;
}

const reactions =
  globalThis.__goodDoomscrollerDemoReactions ?? new Map<string, Map<string, -1 | 1>>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__goodDoomscrollerDemoReactions = reactions;
}

function reactionFor(actorId: string, passageId: string): ReactionValue {
  return reactions.get(actorId)?.get(passageId) ?? 0;
}

function reactionTotals(passageId: string) {
  let likes = 0;
  let dislikes = 0;

  for (const actorReactions of reactions.values()) {
    const value = actorReactions.get(passageId);
    if (value === 1) likes += 1;
    if (value === -1) dislikes += 1;
  }

  return { likes, dislikes };
}

export function getDemoFeed(
  actorId: string,
  cursor: number,
  limit: number,
): FeedResponse {
  const items: FeedPassage[] = Array.from({ length: limit }, (_, index) => {
    const absoluteIndex = cursor + index;
    // Seven is coprime with the fixture count, which spaces books and authors out.
    const fixture = demoPassages[(absoluteIndex * 7) % demoPassages.length];
    const totals = reactionTotals(fixture.id);

    return {
      ...fixture,
      feedToken: `${fixture.id}:${absoluteIndex}`,
      likes: totals.likes,
      dislikes: totals.dislikes,
      viewerReaction: reactionFor(actorId, fixture.id),
    };
  });

  return {
    items,
    nextCursor: String(cursor + limit),
    mode: "demo",
  };
}

export function setDemoReaction(
  actorId: string,
  passageId: string,
  value: ReactionValue,
): ReactionResponse | null {
  const fixture = demoPassages.find((passage) => passage.id === passageId);
  if (!fixture) return null;

  let actorReactions = reactions.get(actorId);
  if (!actorReactions) {
    actorReactions = new Map();
    reactions.set(actorId, actorReactions);
  }

  if (value === 0) {
    actorReactions.delete(passageId);
  } else {
    actorReactions.set(passageId, value);
  }

  const totals = reactionTotals(passageId);
  return {
    passageId,
    likes: totals.likes,
    dislikes: totals.dislikes,
    viewerReaction: value,
    mode: "demo",
  };
}
