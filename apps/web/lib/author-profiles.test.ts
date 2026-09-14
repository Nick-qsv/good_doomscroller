import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUTHOR_AVATAR_PROFILES, authorAvatarProfileFor } from "@/lib/author-avatar-profiles";
import { AUTHOR_PROFILES } from "@/lib/author-profiles";
import { demoPassages } from "@/lib/demo-data";

type PublishedManifest = {
  book: { authors: string[] };
};

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const publishedDirectory = path.join(repositoryRoot, "corpus/published");
const portraitDirectory = path.resolve(import.meta.dirname, "../assets/author-profiles");

function importedImageSource(image: unknown): string {
  if (typeof image === "string") return image;
  if (image && typeof image === "object" && "src" in image && typeof image.src === "string") {
    return image.src;
  }
  throw new TypeError("Static image import did not expose a source path.");
}

function publishedAuthors() {
  return new Set(readdirSync(publishedDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .flatMap((fileName) => {
      const manifest = JSON.parse(readFileSync(path.join(publishedDirectory, fileName), "utf8")) as PublishedManifest;
      expect(manifest.book.authors).toHaveLength(1);
      return manifest.book.authors;
    }));
}

describe("author profile manifest", () => {
  it("exactly covers every published and demo byline", () => {
    const expected = [...publishedAuthors()].sort();
    const mapped = AUTHOR_AVATAR_PROFILES.map((profile) => profile.author).sort();
    const demoAuthors = new Set(demoPassages.map((passage) => passage.author));

    expect(mapped).toEqual(expected);
    expect(AUTHOR_PROFILES.map((profile) => profile.author).sort()).toEqual(expected);
    expect(AUTHOR_AVATAR_PROFILES.map((profile) => profile.assetFileName).sort())
      .toEqual(AUTHOR_PROFILES.map((profile) => profile.assetFileName).sort());
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const author of demoAuthors) {
      expect(authorAvatarProfileFor(author), author).toBeDefined();
    }
    expect(authorAvatarProfileFor("Charles Darwin ")).toBeUndefined();
    expect(authorAvatarProfileFor("Unknown Author")).toBeUndefined();
  });

  it("pins each local WebP derivative and its provenance", () => {
    const expectedFiles = AUTHOR_PROFILES.map((profile) => profile.assetFileName).sort();
    const actualFiles = readdirSync(portraitDirectory).sort();
    const realPortraitDirectory = `${realpathSync(portraitDirectory)}${path.sep}`;

    expect(actualFiles).toEqual(expectedFiles);
    for (const profile of AUTHOR_PROFILES) {
      const avatarProfile = authorAvatarProfileFor(profile.author);
      const requestedPath = path.join(portraitDirectory, profile.assetFileName);
      const actualPath = realpathSync(requestedPath);
      const bytes = readFileSync(actualPath);

      expect(actualPath.startsWith(realPortraitDirectory), profile.author).toBe(true);
      expect(lstatSync(requestedPath).isSymbolicLink(), profile.author).toBe(false);
      expect(bytes.subarray(0, 4).toString("ascii"), profile.author).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), profile.author).toBe("WEBP");
      expect(bytes.byteLength, profile.author).toBeLessThanOrEqual(50 * 1024);
      expect(createHash("sha256").update(bytes).digest("hex"), profile.author)
        .toBe(profile.derivativeSha256);
      expect(profile.originalSha256, profile.author).toMatch(/^[a-f0-9]{64}$/);
      expect(profile.retrievedAt, profile.author).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(profile.image, profile.author).toBeTruthy();
      expect(avatarProfile?.assetFileName, profile.author).toBe(profile.assetFileName);
      expect(avatarProfile?.crop, profile.author).toEqual(profile.crop);
      for (const importedImage of [profile.image, avatarProfile?.image]) {
        expect(decodeURIComponent(importedImageSource(importedImage)), profile.author)
          .toContain(`/author-profiles/${profile.assetFileName}`);
      }
      expect(profile.credit.trim(), profile.author).not.toBe("");
      expect(profile.rights.basis.trim(), profile.author).not.toBe("");
      expect(profile.crop.focusX, profile.author).toBeGreaterThanOrEqual(0);
      expect(profile.crop.focusX, profile.author).toBeLessThanOrEqual(100);
      expect(profile.crop.focusY, profile.author).toBeGreaterThanOrEqual(0);
      expect(profile.crop.focusY, profile.author).toBeLessThanOrEqual(100);
      expect(profile.crop.zoom, profile.author).toBeGreaterThanOrEqual(1);

      for (const url of [profile.sourcePage, profile.originalFileUrl, profile.authenticityResearchUrl, profile.rights.url]) {
        if (url) expect(url, profile.author).toMatch(/^https:\/\//);
      }

      if (profile.kind === "historical-portrait") {
        expect(profile.sourcePage, profile.author).toBeDefined();
        expect(profile.originalFileUrl, profile.author).toBeDefined();
        expect(profile.rights.status, profile.author).not.toBe("project-generated");
        expect(profile.generation, profile.author).toBeUndefined();
        expect(profile.representationNote, profile.author).toBeUndefined();
      } else {
        expect(profile.sourcePage, profile.author).toBeUndefined();
        expect(profile.originalFileUrl, profile.author).toBeUndefined();
        expect(profile.authenticityResearchUrl, profile.author).toBeDefined();
        expect(profile.rights.status, profile.author).toBe("project-generated");
        expect(profile.rights.label, profile.author).toMatch(/no separate reuse license/i);
        expect(profile.generation?.tool, profile.author).toBe("OpenAI built-in image generator");
        expect(profile.generation?.mode, profile.author).toBe("text-to-image");
        expect(profile.generation?.promptSummary, profile.author).toMatch(/clearly interpretive/i);
        expect(profile.representationNote, profile.author).toMatch(/not presented as an authentic likeness/i);
      }
    }
  });
});
