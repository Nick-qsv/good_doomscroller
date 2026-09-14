import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuthorAvatar } from "@/components/author-avatar";

afterEach(cleanup);

describe("AuthorAvatar", () => {
  it("uses a decorative local portrait for a known author", () => {
    const { container } = render(<AuthorAvatar author="Charles Darwin" />);
    const wrapper = container.querySelector(".avatar");
    const image = container.querySelector("img");

    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(wrapper).toHaveTextContent("CD");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveClass("author-portrait");
    expect(image?.getAttribute("style")).toContain("--portrait-focus-x: 43%");
    const imageUrl = new URL(image!.getAttribute("src")!, window.location.origin);
    expect(imageUrl.origin).toBe(window.location.origin);
    expect(imageUrl.pathname).toContain("/assets/author-profiles/charles-darwin.webp");
  });

  it("uses initials when no exact profile is registered", () => {
    const { container } = render(<AuthorAvatar author="Ada Lovelace" />);

    expect(container.querySelector(".avatar")).toHaveTextContent("AL");
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("falls back to initials if a portrait fails to load", () => {
    const { container } = render(<AuthorAvatar author="Charles Darwin" />);
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector(".avatar")).toHaveTextContent("CD");
  });
});
