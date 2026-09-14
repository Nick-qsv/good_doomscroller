import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HowItWorksPage from "@/app/how-it-works/page";

afterEach(cleanup);

describe("short verification guide", () => {
  it("explains selection and fingerprint limits in fewer than 150 words", () => {
    const { container } = render(<HowItWorksPage />);
    expect(screen.getByRole("heading", { name: "How it works" })).toBeVisible();
    expect(screen.getByText(/We record a short reason when choosing/)).toBeVisible();
    expect(screen.getByText(/Blockchain details show whether Polkadot holds the readable reason/)).toBeVisible();
    expect(screen.getByText(/not that its source is authentic/)).toBeVisible();
    expect(screen.getByText(/No wallet needed/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Frederick Douglass" })).toHaveAttribute("href", "/passages/ff132dbc-f6cd-5651-b1c2-c4c5869e480b/verification#decision-heading");
    expect(screen.queryByRole("link", { name: "Emerson" })).not.toBeInTheDocument();
    expect(container.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(150);
    expect(container.querySelector(".verification-eyebrow")).toBeNull();
  });
});
