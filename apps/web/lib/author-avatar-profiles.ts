import type { StaticImageData } from "next/image";

import adamSmithPortrait from "@/assets/author-profiles/adam-smith.webp";
import charlesDarwinPortrait from "@/assets/author-profiles/charles-darwin.webp";
import charlesDickensPortrait from "@/assets/author-profiles/charles-dickens.webp";
import frederickDouglassPortrait from "@/assets/author-profiles/frederick-douglass.webp";
import harrietJacobsPortrait from "@/assets/author-profiles/harriet-jacobs.webp";
import laoziPortrait from "@/assets/author-profiles/laozi.webp";
import ludwigNohlPortrait from "@/assets/author-profiles/ludwig-nohl.webp";
import margaretCavendishPortrait from "@/assets/author-profiles/margaret-cavendish.webp";
import maryAstellPortrait from "@/assets/author-profiles/mary-astell.webp";
import marySomervillePortrait from "@/assets/author-profiles/mary-somerville.webp";
import maryShelleyPortrait from "@/assets/author-profiles/mary-wollstonecraft-shelley.webp";
import michaelFaradayPortrait from "@/assets/author-profiles/michael-faraday.webp";
import olaudahEquianoPortrait from "@/assets/author-profiles/olaudah-equiano.webp";
import thomasPainePortrait from "@/assets/author-profiles/thomas-paine.webp";

export type AuthorAvatarProfile = {
  author: string;
  image: StaticImageData;
  assetFileName: string;
  crop: { focusX: number; focusY: number; zoom: number };
};

export const AUTHOR_AVATAR_PROFILES: readonly AuthorAvatarProfile[] = [
  { author: "Adam Smith", image: adamSmithPortrait, assetFileName: "adam-smith.webp", crop: { focusX: 58, focusY: 32, zoom: 1.25 } },
  { author: "Charles Darwin", image: charlesDarwinPortrait, assetFileName: "charles-darwin.webp", crop: { focusX: 43, focusY: 30, zoom: 1.3 } },
  { author: "Charles Dickens", image: charlesDickensPortrait, assetFileName: "charles-dickens.webp", crop: { focusX: 55, focusY: 25, zoom: 1.8 } },
  { author: "Frederick Douglass", image: frederickDouglassPortrait, assetFileName: "frederick-douglass.webp", crop: { focusX: 50, focusY: 34, zoom: 1.3 } },
  { author: "Harriet A. Jacobs", image: harrietJacobsPortrait, assetFileName: "harriet-jacobs.webp", crop: { focusX: 52, focusY: 31, zoom: 2.1 } },
  { author: "Laozi", image: laoziPortrait, assetFileName: "laozi.webp", crop: { focusX: 50, focusY: 40, zoom: 1.15 } },
  { author: "Ludwig Nohl", image: ludwigNohlPortrait, assetFileName: "ludwig-nohl.webp", crop: { focusX: 53, focusY: 25, zoom: 1.3 } },
  { author: "Margaret Cavendish", image: margaretCavendishPortrait, assetFileName: "margaret-cavendish.webp", crop: { focusX: 46, focusY: 17, zoom: 2.5 } },
  { author: "Mary Astell", image: maryAstellPortrait, assetFileName: "mary-astell.webp", crop: { focusX: 50, focusY: 42, zoom: 1.15 } },
  { author: "Mary Somerville", image: marySomervillePortrait, assetFileName: "mary-somerville.webp", crop: { focusX: 38, focusY: 25, zoom: 1.7 } },
  { author: "Mary Wollstonecraft Shelley", image: maryShelleyPortrait, assetFileName: "mary-wollstonecraft-shelley.webp", crop: { focusX: 50, focusY: 25, zoom: 1.9 } },
  { author: "Michael Faraday", image: michaelFaradayPortrait, assetFileName: "michael-faraday.webp", crop: { focusX: 48, focusY: 33, zoom: 1.8 } },
  { author: "Olaudah Equiano", image: olaudahEquianoPortrait, assetFileName: "olaudah-equiano.webp", crop: { focusX: 50, focusY: 25, zoom: 1.9 } },
  { author: "Thomas Paine", image: thomasPainePortrait, assetFileName: "thomas-paine.webp", crop: { focusX: 50, focusY: 31, zoom: 1.5 } },
];

const profilesByAuthor = new Map(AUTHOR_AVATAR_PROFILES.map((profile) => [profile.author, profile]));

if (profilesByAuthor.size !== AUTHOR_AVATAR_PROFILES.length) {
  throw new Error("Author avatar profile names must be unique.");
}

export function authorAvatarProfileFor(author: string): AuthorAvatarProfile | undefined {
  return profilesByAuthor.get(author);
}
