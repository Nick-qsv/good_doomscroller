import { describe, expect, it } from "vitest";

import { getDemoFeed, setDemoReaction } from "@/lib/demo-store";

describe("demo feed", () => {
  it("paginates continuously with unique feed tokens", () => {
    const first = getDemoFeed("actor-a", 0, 6);
    const second = getDemoFeed("actor-a", Number(first.nextCursor), 6);

    expect(first.items).toHaveLength(6);
    expect(second.items).toHaveLength(6);
    expect(first.items[0].feedToken).not.toBe(second.items[0].feedToken);
    expect(second.nextCursor).toBe("12");
  });

  it("supports like, dislike, and undo", () => {
    const passage = getDemoFeed("actor-b", 0, 1).items[0];
    expect(passage.likes).toBe(0);
    expect(passage.dislikes).toBe(0);

    const liked = setDemoReaction("actor-b", passage.id, 1);
    const disliked = setDemoReaction("actor-b", passage.id, -1);
    const undone = setDemoReaction("actor-b", passage.id, 0);

    expect(liked?.viewerReaction).toBe(1);
    expect(liked?.likes).toBe(1);
    expect(liked?.dislikes).toBe(0);
    expect(disliked?.viewerReaction).toBe(-1);
    expect(disliked?.likes).toBe(0);
    expect(disliked?.dislikes).toBe(1);
    expect(undone?.viewerReaction).toBe(0);
    expect(undone?.likes).toBe(0);
    expect(undone?.dislikes).toBe(0);
  });
});
