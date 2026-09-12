import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PassageCard } from "@/components/feed";
import type { FeedPassage } from "@/lib/types";

const passage: FeedPassage = {
  id: "example-passage", feedToken: "example-passage:0", text: "The original author’s words.",
  author: "Example Author", bookTitle: "Example Book", chapterTitle: "Chapter I",
  publicationYear: null, sourceUrl: "https://www.gutenberg.org/ebooks/1342",
  themes: [], likes: 0, dislikes: 0, viewerReaction: 0,
};

afterEach(cleanup);

describe("AI context in passage cards", () => {
  it("labels interpretation separately from the unchanged source quotation", () => {
    const text = "The character may be reconsidering an earlier judgment.";
    const { container } = render(<PassageCard passage={{ ...passage, aiContext: {
      text, generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
    } }} pending={false} onReact={vi.fn()} />);
    const note = screen.getByRole("note", { name: "AI context" });
    expect(within(note).getByText("AI context")).toBeVisible();
    expect(within(note).getByText(text)).toBeVisible();
    expect(note).toHaveTextContent("AI-generated interpretation; may be inaccurate.");
    expect(note).toHaveTextContent("Not part of the original quotation.");
    expect(container.querySelector("blockquote p")?.textContent).toBe(passage.text);
    expect(note.closest("blockquote")).toBeNull();
    expect(screen.getByRole("link", { name: "Verify quote from Example Book" })).toBeVisible();
  });

  it("keeps existing passages readable without an empty context label", () => {
    render(<PassageCard passage={passage} pending={false} onReact={vi.fn()} />);
    expect(screen.getByText(passage.text)).toBeVisible();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText("AI context")).not.toBeInTheDocument();
  });

  it("renders context as text rather than executable markup", () => {
    const { container } = render(<PassageCard passage={{ ...passage, aiContext: {
      text: "<img src=x onerror=alert(1)> is ordinary text here.",
      generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
    } }} pending={false} onReact={vi.fn()} />);
    expect(screen.getByRole("note")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });
});
