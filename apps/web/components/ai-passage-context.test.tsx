import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("hides interpretation until the quote is selected, then labels it separately", () => {
    const text = "The character may be reconsidering an earlier judgment.";
    const { container } = render(<PassageCard passage={{ ...passage, aiContext: {
      text, generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
    } }} pending={false} onReact={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: passage.text });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleDescription("Select quote for AI context");
    expect(screen.queryByRole("note", { name: "AI context" })).not.toBeInTheDocument();
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    const controlled = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(controlled).not.toBeVisible();
    toggle.focus();
    expect(toggle).toHaveFocus();
    // A native button supports Enter/Space activation without custom key handlers.
    fireEvent.click(toggle, { detail: 0 });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controlled).toBeVisible();
    const note = screen.getByRole("note", { name: "AI context" });
    expect(within(note).getByText("AI context")).toBeVisible();
    expect(within(note).getByText(text)).toBeVisible();
    expect(note).toHaveTextContent("AI-generated interpretation; may be inaccurate.");
    expect(note).toHaveTextContent("Not part of the original quotation.");
    expect(container.querySelector("blockquote p")?.textContent).toBe(passage.text);
    expect(note.closest("blockquote")).toBeNull();
    expect(screen.getByRole("link", { name: "Verify quote from Example Book" })).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controlled).not.toBeVisible();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("keeps existing passages readable without an empty context label", () => {
    render(<PassageCard passage={passage} pending={false} onReact={vi.fn()} />);
    expect(screen.getByText(passage.text)).toBeVisible();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText("AI context")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: passage.text })).not.toBeInTheDocument();
    expect(screen.queryByText("Select quote for AI context")).not.toBeInTheDocument();
  });

  it("renders context as text rather than executable markup", () => {
    const { container } = render(<PassageCard passage={{ ...passage, aiContext: {
      text: "<img src=x onerror=alert(1)> is ordinary text here.",
      generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
    } }} pending={false} onReact={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: passage.text }));
    expect(screen.getByRole("note")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps source links and reactions independent of the context toggle", () => {
    const onReact = vi.fn();
    render(<PassageCard passage={{ ...passage, aiContext: {
      text: "Some context.", generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
    } }} pending={false} onReact={onReact} />);
    const toggle = screen.getByRole("button", { name: passage.text });
    fireEvent.click(screen.getByRole("link", { name: /Read the source of Example Book/ }));
    fireEvent.click(screen.getByRole("button", { name: "Like passage by Example Author" }));
    expect(onReact).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Dislike passage by Example Author" }));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("gives repeated quotes independent context panels", () => {
    const withContext = { ...passage, aiContext: {
      text: "Some context.", generatedBy: "AI" as const, generatedAt: "2026-09-12T20:00:00Z",
    } };
    render(<>
      <PassageCard passage={withContext} pending={false} onReact={vi.fn()} />
      <PassageCard passage={{ ...withContext, feedToken: "example-passage:1" }} pending={false} onReact={vi.fn()} />
    </>);
    const toggles = screen.getAllByRole("button", { name: passage.text });
    expect(toggles[0].getAttribute("aria-controls")).not.toBe(toggles[1].getAttribute("aria-controls"));
    fireEvent.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("note", { name: "AI context" })).toHaveLength(1);
  });
});
