import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadingSettings } from "./reading-settings";

const storageKey = "good-doomscroller:reading:v1";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  cleanup();
  delete document.documentElement.dataset.readingFont;
  document.documentElement.style.removeProperty("--reading-scale");
});

describe("ReadingSettings", () => {
  it("restores saved choices without overwriting them during initialization", () => {
    const saved = JSON.stringify({ version: 1, font: "book", size: 130 });
    window.localStorage.setItem(storageKey, saved);
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<ReadingSettings />);

    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("book");
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("130%");
    expect(document.documentElement.dataset.readingFont).toBe("book");
    expect(document.documentElement.style.getPropertyValue("--reading-scale")).toBe("1.3");
    expect(write).not.toHaveBeenCalled();
  });

  it("saves changes across remounts and resets both text choices", () => {
    const first = render(<ReadingSettings />);
    fireEvent.change(screen.getByRole("combobox", { name: "Font" }), { target: { value: "sans" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual({
      version: 1, font: "sans", size: 115,
    });
    first.unmount();
    render(<ReadingSettings />);
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("sans");
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("115%");

    fireEvent.click(screen.getByRole("button", { name: "Reset reading style" }));
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("classic");
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("100%");
    expect(document.documentElement.dataset.readingFont).toBe("classic");
    expect(document.documentElement.style.getPropertyValue("--reading-scale")).toBe("1");
  });

  it.each([
    ["{broken", "classic", "100%"],
    [JSON.stringify({ version: 2, font: "sans", size: 130 }), "classic", "100%"],
    [JSON.stringify({ version: 1, font: "url(example)", size: 999 }), "classic", "150%"],
    [JSON.stringify({ version: 1, font: "book", size: -50 }), "book", "90%"],
  ])("safely validates stored preferences %s", (saved, font, size) => {
    window.localStorage.setItem(storageKey, saved);
    render(<ReadingSettings />);
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue(font);
    expect(screen.getByLabelText("Current text size")).toHaveTextContent(size);
  });

  it("keeps controls usable when storage is blocked and bounds text sizes", () => {
    const first = render(<ReadingSettings />);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.change(screen.getByRole("combobox", { name: "Font" }), { target: { value: "sans" } });
    for (let index = 0; index < 5; index++) {
      fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    }
    expect(screen.getByRole("button", { name: "Increase text size" })).toBeDisabled();
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("150%");
    first.unmount();
    render(<ReadingSettings />);
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("sans");
    expect(document.documentElement.style.getPropertyValue("--reading-scale")).toBe("1.5");
    for (let index = 0; index < 6; index++) {
      fireEvent.click(screen.getByRole("button", { name: "Decrease text size" }));
    }
    expect(screen.getByRole("button", { name: "Decrease text size" })).toBeDisabled();
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("90%");
    fireEvent.click(screen.getByRole("button", { name: "Reset reading style" }));
    expect(screen.getByLabelText("Current text size")).toHaveTextContent("100%");
  });

  it("updates the controls and quotation styles when another tab changes preferences", () => {
    render(<ReadingSettings />);
    act(() => {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, font: "book", size: 115 }));
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
    });
    expect(screen.getByRole("combobox", { name: "Font" })).toHaveValue("book");
    expect(document.documentElement.dataset.readingFont).toBe("book");
    expect(document.documentElement.style.getPropertyValue("--reading-scale")).toBe("1.15");
  });

  it("renders consistent disabled defaults on the server until browser preferences are restored", () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, font: "sans", size: 150 }));
    const html = renderToString(<ReadingSettings />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('value="classic" selected=""');
    expect(html).toContain("100");
  });
});
