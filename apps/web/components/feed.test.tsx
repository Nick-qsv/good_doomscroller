import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Feed } from "@/components/feed";
import type { FeedPassage, FeedResponse, LibraryResponse } from "@/lib/types";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    window.addEventListener("popstate", listener);
    window.addEventListener("feed-navigation", listener);
    return () => {
      window.removeEventListener("popstate", listener);
      window.removeEventListener("feed-navigation", listener);
    };
  };
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  };
});

vi.mock("@/components/analytics", () => ({ useAnalyticsExposure: () => ({ current: null }) }));
vi.mock("@/lib/analytics-client", () => ({ trackAnalytics: vi.fn() }));
vi.mock("@/components/ai-passage-context", () => ({ AiPassageContext: () => null }));

let fetchMock: ReturnType<typeof vi.fn>;
let libraryMock: ReturnType<typeof vi.fn>;
const observers: Array<{ callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
const catalog: LibraryResponse = {
  books: [
    { id: "book-one", title: "Pride and Prejudice", author: "Jane Austen", count: 12 },
    { id: "book-two", title: "Walden", author: "Henry David Thoreau", count: 8 },
  ],
  themes: [{ name: "society", count: 12 }, { name: "courage", count: 8 }],
  total: 20,
  mode: "database",
};

function passage(id: string, page = "first"): FeedPassage {
  return {
    id, feedToken: `${id}:${page}`, text: `Words from quote ${id}.`,
    author: "Jane Austen", bookTitle: "Pride and Prejudice", publicationYear: 1813,
    chapterTitle: "Chapter I", sourceUrl: "https://www.gutenberg.org/ebooks/1342",
    themes: ["society"], likes: 0, dislikes: 0, viewerReaction: 0,
  };
}

function page(items: FeedPassage[], nextCursor: string | null, revisited = false, totalMatching = 20) {
  const feed: FeedResponse = { items, nextCursor, mode: "database", revisited, totalMatching };
  return { ok: true, json: async () => feed };
}

function approachBottom() {
  act(() => observers.at(-1)!.callback(
    [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
  ));
}

beforeEach(() => {
  observers.length = 0;
  window.localStorage.removeItem("good-doomscroller:reading:v1");
  window.history.replaceState(null, "", "/");
  const pushState = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
    pushState(data, unused, url);
    // Next integrates the native history API with useSearchParams.
    window.dispatchEvent(new Event("feed-navigation"));
  });
  fetchMock = vi.fn();
  libraryMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalog });
  vi.stubGlobal("fetch", (url: string, options: RequestInit) => (
    url === "/api/library" ? libraryMock(url, options) : fetchMock(url, options)
  ));
  vi.stubGlobal("IntersectionObserver", class {
    disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
    observe() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fresh, continuous passage feed", () => {
  it("starts immediately and requests a fresh page ID on a return visit", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "page-two"));
    const first = render(<Feed />);
    await screen.findByText("Words from quote one.");
    const firstUrl = new URL(fetchMock.mock.calls[0][0], "https://gdscroll.com");
    expect(firstUrl.searchParams.get("cursor")).toMatch(/^[0-9a-f-]{36}$/);
    first.unmount();

    fetchMock.mockResolvedValueOnce(page([passage("two")], "page-three"));
    render(<Feed />);
    await screen.findByText("Words from quote two.");
    expect(fetchMock.mock.calls[1][0]).not.toBe(fetchMock.mock.calls[0][0]);
  });

  it("automatically appends pages, allows revisits with distinct tokens, and keeps loading", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "page-two"))
      .mockResolvedValueOnce(page([passage("two", "second")], "page-three"))
      .mockResolvedValueOnce(page([passage("one", "third")], "page-four", true));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    approachBottom();
    await screen.findByText("Words from quote two.");
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=page-two");
    approachBottom();
    await waitFor(() => expect(screen.getAllByText("Words from quote one.")).toHaveLength(2));
    expect(screen.getByText(/You’ve explored the current library/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Load more quotes" })).toBeVisible();
    expect(screen.queryByText("End of shelf.")).not.toBeInTheDocument();
  });

  it("prevents concurrent page loads and reuses a failed request ID on retry", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "page-two"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    let rejectRequest!: (reason: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    approachBottom();
    approachBottom();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => rejectRequest(new Error("offline")));
    expect(screen.getByRole("alert")).toBeVisible();
    fetchMock.mockResolvedValueOnce(page([passage("two")], "page-three"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Words from quote two.");
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[1][0]);
  });

  it("retries the first page without consuming a different request ID", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([passage("one")], "page-two"));
    render(<Feed />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Words from quote one.");
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
  });

  it("provides manual pagination when observers are unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    fetchMock.mockResolvedValueOnce(page([passage("one")], "page-two"))
      .mockResolvedValueOnce(page([passage("two")], "page-three"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    fireEvent.click(screen.getByRole("button", { name: "Load more quotes" }));
    await screen.findByText("Words from quote two.");
  });

  it("stops an empty library and rejects a page that cannot advance", async () => {
    fetchMock.mockResolvedValueOnce(page([], null));
    const empty = render(<Feed />);
    await screen.findByText("No passages are available yet. Please check back soon.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Load more quotes" })).not.toBeInTheDocument();
    empty.unmount();

    fetchMock.mockResolvedValueOnce(page([passage("one")], "page-two"))
      .mockResolvedValueOnce(page([passage("two")], "page-two"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    approachBottom();
    await screen.findByRole("alert");
    expect(screen.queryByText("Words from quote two.")).not.toBeInTheDocument();
  });

  it("combines book and theme filters, replaces quotes, and keeps both filters when scrolling", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "old-next"))
      .mockResolvedValueOnce(page([passage("book")], "book-next", false, 12))
      .mockResolvedValueOnce(page([passage("both")], "both-next", false, 5))
      .mockResolvedValueOnce(page([passage("more")], "more-next", false, 5));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    expect(screen.getByRole("combobox", { name: "Book" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Walden · Henry David Thoreau" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Book" }), { target: { value: "book-one" } });
    await screen.findByText("Words from quote book.");
    expect(screen.queryByText("Words from quote one.")).not.toBeInTheDocument();
    const initialParams = new URL(fetchMock.mock.calls[0][0], window.location.origin).searchParams;
    const bookParams = new URL(fetchMock.mock.calls[1][0], window.location.origin).searchParams;
    expect(bookParams.get("book")).toBe("book-one");
    expect(bookParams.get("cursor")).not.toBe(initialParams.get("cursor"));
    expect(bookParams.get("cursor")).not.toBe("old-next");

    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "society" } });
    await screen.findByText("Words from quote both.");
    expect(screen.getByText("5 quotes match your filters")).toBeVisible();
    expect(window.location.search).toBe("?book=book-one&theme=society");
    expect(screen.queryByText("Words from quote book.")).not.toBeInTheDocument();
    approachBottom();
    await screen.findByText("Words from quote more.");
    const next = new URL(fetchMock.mock.calls[3][0], window.location.origin).searchParams;
    expect(Object.fromEntries(next)).toEqual({ cursor: "both-next", limit: "6", book: "book-one", theme: "society" });
    expect(libraryMock).toHaveBeenCalledTimes(1);
  });

  it("shows a real empty filtered result and resets to the full library", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "first-next"))
      .mockResolvedValueOnce(page([], null, false, 0))
      .mockResolvedValueOnce(page([passage("reset")], "reset-next"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "courage" } });
    await screen.findByText(/No quotes match these filters/);
    expect(screen.getByText("0 quotes match your filters")).toBeVisible();
    expect(screen.queryByText("Words from quote one.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more quotes" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await screen.findByText("Words from quote reset.");
    expect(window.location.search).toBe("");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("");
    expect(fetchMock.mock.calls[2][0]).not.toContain("theme=");
  });

  it("aborts obsolete requests and ignores late results after a filter change", async () => {
    let resolveOld!: (value: ReturnType<typeof page>) => void;
    let resolveSelected!: (value: ReturnType<typeof page>) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSelected = resolve; }))
      .mockResolvedValueOnce(page([passage("more")], "final-next"));
    render(<Feed />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Book" }), { target: { value: "book-two" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveOld(page([passage("obsolete")], "obsolete-next", true)));
    expect(screen.queryByText("Words from quote obsolete.")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Passage feed" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/You’ve explored/)).not.toBeInTheDocument();
    await act(async () => resolveSelected(page([passage("selected")], "selected-next")));
    approachBottom();
    await screen.findByText("Words from quote more.");
    expect(fetchMock.mock.calls[2][0]).toContain("cursor=selected-next");
    expect(fetchMock.mock.calls[2][0]).toContain("book=book-two");
  });

  it("restores linked filters and browser history with a fresh feed on every navigation", async () => {
    window.history.replaceState(null, "", "/?book=book-one&theme=society");
    fetchMock.mockResolvedValueOnce(page([passage("linked")], "linked-next", true, 8))
      .mockResolvedValueOnce(page([passage("changed")], "changed-next", false, 4))
      .mockResolvedValueOnce(page([passage("back")], "back-next", false, 8));
    render(<Feed />);
    await screen.findByText("Words from quote linked.");
    expect(screen.getByRole("combobox", { name: "Book" })).toHaveValue("book-one");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("society");
    expect(fetchMock.mock.calls[0][0]).toContain("book=book-one&theme=society");
    expect(screen.getByText(/You’ve explored the quotes matching these filters/)).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "courage" } });
    await screen.findByText("Words from quote changed.");
    expect(screen.queryByText(/You’ve explored/)).not.toBeInTheDocument();
    act(() => window.history.back());
    await screen.findByText("Words from quote back.");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveValue("society");
    expect(fetchMock.mock.calls[2][0]).toContain("book=book-one&theme=society");
    expect(fetchMock.mock.calls[2][0]).not.toBe(fetchMock.mock.calls[0][0]);
  });

  it("lets readers retry filter choices without interrupting the feed", async () => {
    libraryMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValueOnce(page([passage("one")], "next"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    expect(screen.getByRole("combobox", { name: "Book" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry filters" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Book" })).toBeEnabled());
    expect(screen.getByText("Words from quote one.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps reading preferences through filter changes without fetching for style changes", async () => {
    fetchMock.mockResolvedValueOnce(page([passage("one")], "first-next"))
      .mockResolvedValueOnce(page([passage("filtered")], "filtered-next"));
    render(<Feed />);
    await screen.findByText("Words from quote one.");
    expect(screen.getByRole("group", { name: "Reading style" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Font" }), { target: { value: "sans" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(document.documentElement).toHaveAttribute("data-reading-font", "sans");
    expect(document.documentElement.style.getPropertyValue("--reading-scale")).toBe("1.15");
    expect(screen.getByText("115%")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Words from quote one.")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Book" }), { target: { value: "book-two" } });
    await screen.findByText("Words from quote filtered.");
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("sans");
    expect(screen.getByText("115%")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-reading-font", "sans");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
