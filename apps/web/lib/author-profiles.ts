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

export type AuthorProfile = {
  author: string;
  image: StaticImageData;
  assetFileName: string;
  kind: "historical-portrait" | "interpretive";
  crop: { focusX: number; focusY: number; zoom: number };
  creator: string;
  date: string;
  credit: string;
  sourcePage?: string;
  originalFileUrl?: string;
  authenticityResearchUrl?: string;
  retrievedAt: string;
  originalSha256: string;
  derivativeSha256: string;
  rights: {
    status: "public-domain" | "cc0" | "project-generated";
    label: string;
    basis: string;
    url?: string;
  };
  generation?: {
    tool: string;
    mode: string;
    promptSummary: string;
  };
  representationNote?: string;
};

const PUBLIC_DOMAIN_MARK = "https://creativecommons.org/publicdomain/mark/1.0/";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

export const AUTHOR_PROFILES: readonly AuthorProfile[] = [
  {
    author: "Adam Smith",
    image: adamSmithPortrait,
    assetFileName: "adam-smith.webp",
    kind: "historical-portrait",
    crop: { focusX: 58, focusY: 32, zoom: 1.25 },
    creator: "Daderot, photographing an eighteenth-century Wedgwood medallion",
    date: "2016 photograph of a 1787 medallion",
    credit: "Daderot / Wedgwood Museum, CC0",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Adam_Smith,_1787_-_Wedgwood_Museum_-_Barlaston,_Stoke-on-Trent,_England_-_DSC09700.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/3/34/Adam_Smith%2C_1787_-_Wedgwood_Museum_-_Barlaston%2C_Stoke-on-Trent%2C_England_-_DSC09700.jpg",
    authenticityResearchUrl: "https://www.npg.org.uk/collections/search/portraitExtended/mw05836/Adam-Smith",
    retrievedAt: "2026-09-13",
    originalSha256: "2b08c6e568e35023cc5a63d4ce758db2ca3a81b3bb61c8576c26a992b15d3b80",
    derivativeSha256: "3e2fd4d15413ffb1e91a301f6253df5814fccb7ec701080f81cc202542ab7266",
    rights: {
      status: "cc0",
      label: "CC0 1.0",
      basis: "The Wikimedia Commons file record identifies the photograph as released under CC0 1.0.",
      url: CC0,
    },
  },
  {
    author: "Charles Darwin",
    image: charlesDarwinPortrait,
    assetFileName: "charles-darwin.webp",
    kind: "historical-portrait",
    crop: { focusX: 43, focusY: 30, zoom: 1.3 },
    creator: "Julia Margaret Cameron",
    date: "circa 1868; carbon print dated 1875",
    credit: "Julia Margaret Cameron / Art Institute of Chicago, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Charles_Darwin_by_Julia_Margaret_Cameron,_c._1868_-_Original.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/6/64/Charles_Darwin_by_Julia_Margaret_Cameron%2C_c._1868_-_Original.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "844963d671bc92846cdf142c5028c6667bfd11137226bbbd64b377073b213499",
    derivativeSha256: "2f471e3e2afb0097f6829cfe2291f5ad62fb1da0166c3709cd5a7c3c184064ea",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical photograph as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Charles Dickens",
    image: charlesDickensPortrait,
    assetFileName: "charles-dickens.webp",
    kind: "historical-portrait",
    crop: { focusX: 55, focusY: 25, zoom: 1.8 },
    creator: "Herbert Watkins",
    date: "April 29, 1858",
    credit: "Herbert Watkins, 1858, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Charles_Dickens_by_Herbert_Watkins_29_April_1858_(alternate).jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/5/56/Charles_Dickens_by_Herbert_Watkins_29_April_1858_%28alternate%29.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "54f10dfeea2e92e44ee069f3b315c48a6ee599ce65f531b460d6dce2fda6949c",
    derivativeSha256: "0c50527a0759d69b32bf4a1757d9db2432a71890b496b03e1da2b6d54749af04",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical photograph as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Frederick Douglass",
    image: frederickDouglassPortrait,
    assetFileName: "frederick-douglass.webp",
    kind: "historical-portrait",
    crop: { focusX: 50, focusY: 34, zoom: 1.3 },
    creator: "George Kendall Warren",
    date: "circa 1879",
    credit: "George Kendall Warren / U.S. National Archives, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Frederick_Douglass_(circa_1879).jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Frederick_Douglass_%28circa_1879%29.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "44c4da5fc7cac676b5edd0e0f744faf033512a762c7eaa728e569cb83c6fd2c4",
    derivativeSha256: "d73519a73768c6fbc4ef407b3ca46c0e899462cfc6fb2ffc5602169a32d138d7",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical photograph as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Harriet A. Jacobs",
    image: harrietJacobsPortrait,
    assetFileName: "harriet-jacobs.webp",
    kind: "historical-portrait",
    crop: { focusX: 52, focusY: 31, zoom: 2.1 },
    creator: "Gilbert Studios; restored by Adam Cuerden",
    date: "1894",
    credit: "Gilbert Studios, 1894; restored by Adam Cuerden, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Gilbert_Studios_photograph_of_Harriet_Jacobs.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/e/ee/Gilbert_Studios_photograph_of_Harriet_Jacobs.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "c4a401250ec7fad2b166c09d8dbdd61a67773db83ccddf2e85ec64a668fb6797",
    derivativeSha256: "ac622bedb9fa64ee8ee50a32e9710bdeccbe81364422ec376cdb079f8fc27304",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical photograph as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Laozi",
    image: laoziPortrait,
    assetFileName: "laozi.webp",
    kind: "interpretive",
    crop: { focusX: 50, focusY: 40, zoom: 1.15 },
    creator: "OpenAI image generator, directed by Good Doomscroller",
    date: "September 13, 2026",
    credit: "Interpretive image generated for Good Doomscroller",
    authenticityResearchUrl: "https://plato.stanford.edu/entries/laozi/",
    retrievedAt: "2026-09-13",
    originalSha256: "adedb8e8af2d457d3f012f3af8f6a4fc5d997ea9b77eff2e228b6519156b0a60",
    derivativeSha256: "7029625d7378182b1c03b6ed8ad096d32027cd08c1a7ca32daa570e91f33cc9c",
    rights: {
      status: "project-generated",
      label: "Project-generated; no separate reuse license",
      basis: "Created specifically for this project with OpenAI's built-in image generator; no source portrait was used and no separate reuse license is granted.",
    },
    generation: {
      tool: "OpenAI built-in image generator",
      mode: "text-to-image",
      promptSummary: "A clearly interpretive, non-photorealistic traditional Chinese ink-and-woodblock head-and-shoulders depiction of an elderly philosopher in plain robes, composed for a circular avatar with no text, characters, symbols, or watermark.",
    },
    representationNote: "This is an imagined, non-photorealistic depiction. It is not presented as an authentic likeness; Laozi's historical identity is disputed and no authentic portrait can be established.",
  },
  {
    author: "Ludwig Nohl",
    image: ludwigNohlPortrait,
    assetFileName: "ludwig-nohl.webp",
    kind: "historical-portrait",
    crop: { focusX: 53, focusY: 25, zoom: 1.3 },
    creator: "Ed. Lange, Heidelberg",
    date: "photographed 1872–1883; published 1886",
    credit: "Ed. Lange / Heidelberg University Library, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Ruperto_Carola_500-22_Ludwig_Nohl.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6c/Ruperto_Carola_500-22_Ludwig_Nohl.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "8d21348facb7b9057b83bbd10630f9e2ff5f3b145f3f501b8c386c23145a2444",
    derivativeSha256: "452431989760f389b2828a523b2b153a023ce0c20523533a726cfa9f8615d2f9",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this photograph from an 1886 publication as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Margaret Cavendish",
    image: margaretCavendishPortrait,
    assetFileName: "margaret-cavendish.webp",
    kind: "historical-portrait",
    crop: { focusX: 46, focusY: 17, zoom: 2.5 },
    creator: "Peter Lely",
    date: "1665",
    credit: "Peter Lely / The Portland Collection, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Margaret_Cavendish,_Duchess_of_Newcastle,_by_Peter_Lely.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ac/Margaret_Cavendish%2C_Duchess_of_Newcastle%2C_by_Peter_Lely.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "800bdce207807708a2a8bbc58eb6450e0f09bb358a4bec05d66f8ff600760565",
    derivativeSha256: "35204f5d5f7c0e164c1c14d5a90763bb65a4526c965ef89b4a5d5365be4606cf",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this seventeenth-century painting as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Mary Astell",
    image: maryAstellPortrait,
    assetFileName: "mary-astell.webp",
    kind: "interpretive",
    crop: { focusX: 50, focusY: 42, zoom: 1.15 },
    creator: "OpenAI image generator, directed by Good Doomscroller",
    date: "September 13, 2026",
    credit: "Interpretive image generated for Good Doomscroller",
    authenticityResearchUrl: "https://projectvox.org/astell-1666-1731/",
    retrievedAt: "2026-09-13",
    originalSha256: "497b0057f91fb3e08665063a2c8c28e6f111c13c8917974820506a6154f8af75",
    derivativeSha256: "53b5c6c3078c17cb7921f12e72f2a894277710175094aa3f99e84fff3fd6f8ea",
    rights: {
      status: "project-generated",
      label: "Project-generated; no separate reuse license",
      basis: "Created specifically for this project with OpenAI's built-in image generator; no source portrait was used and no separate reuse license is granted.",
    },
    generation: {
      tool: "OpenAI built-in image generator",
      mode: "text-to-image",
      promptSummary: "A clearly interpretive, non-photorealistic late-seventeenth-century engraved head-and-shoulders depiction of an English woman writer and philosopher in restrained late Stuart clothing, composed for a circular avatar with no text, symbols, or watermark.",
    },
    representationNote: "This is an imagined, non-photorealistic depiction. It is not presented as an authentic likeness; Project Vox reports that no depictions of Mary Astell are currently extant.",
  },
  {
    author: "Mary Somerville",
    image: marySomervillePortrait,
    assetFileName: "mary-somerville.webp",
    kind: "historical-portrait",
    crop: { focusX: 38, focusY: 25, zoom: 1.7 },
    creator: "James Rannie Swinton",
    date: "1844",
    credit: "James Rannie Swinton / Somerville College, Oxford, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Mary_Somerville_1844_portrait.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Mary_Somerville_1844_portrait.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "0c53dea026f018708aa93c48778a172167cbfd638efe9e342628f2cf30e084c4",
    derivativeSha256: "4fd1bbe6d687afd1eb641513b768920435478d76e5d43746e505a94153c692d5",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical painting as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Mary Wollstonecraft Shelley",
    image: maryShelleyPortrait,
    assetFileName: "mary-wollstonecraft-shelley.webp",
    kind: "historical-portrait",
    crop: { focusX: 50, focusY: 25, zoom: 1.9 },
    creator: "Richard Rothwell",
    date: "1840",
    credit: "Richard Rothwell / National Portrait Gallery, London, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:RothwellMaryShelley.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/6/65/RothwellMaryShelley.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "46728b67ee66bae6683f9ebec3a6aef60537077bababee89e9ccca0f4c11c1cb",
    derivativeSha256: "98ab3f806a2cd9151400e2b71f94435907c90394e70185806f00fec7647c8cec",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this historical painting as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Michael Faraday",
    image: michaelFaradayPortrait,
    assetFileName: "michael-faraday.webp",
    kind: "historical-portrait",
    crop: { focusX: 48, focusY: 33, zoom: 1.8 },
    creator: "William Holl the Younger, after George Richmond",
    date: "1852",
    credit: "William Holl the Younger, after George Richmond / The Metropolitan Museum of Art, CC0",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Portrait_of_Michael_Faraday_MET_DP829484.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/9/91/Portrait_of_Michael_Faraday_MET_DP829484.jpg",
    authenticityResearchUrl: "https://www.metmuseum.org/art/collection/search/420541",
    retrievedAt: "2026-09-13",
    originalSha256: "0ee1fc11b6c264f016fcc8bdfdd99f16e025596b7732ef53a3ba8ce5f39ede5f",
    derivativeSha256: "e172729c178492b49423905777ade16b37786ae3970131457264510bf0da84fa",
    rights: {
      status: "cc0",
      label: "CC0 1.0",
      basis: "The Metropolitan Museum of Art and Wikimedia Commons identify this Open Access image as CC0.",
      url: CC0,
    },
  },
  {
    author: "Olaudah Equiano",
    image: olaudahEquianoPortrait,
    assetFileName: "olaudah-equiano.webp",
    kind: "historical-portrait",
    crop: { focusX: 50, focusY: 25, zoom: 1.9 },
    creator: "Daniel Orme, after W. Denton",
    date: "published March 1, 1789",
    credit: "Daniel Orme, after W. Denton / National Portrait Gallery, London, public domain",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Daniel_Orme,_W._Denton_-_Olaudah_Equiano_(Gustavus_Vassa),_1789.png",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c0/Daniel_Orme%2C_W._Denton_-_Olaudah_Equiano_%28Gustavus_Vassa%29%2C_1789.png",
    authenticityResearchUrl: "https://www.npg.org.uk/collections/search/portrait?locid=1035&mkey=mw42525&rNo=18&wPage=0",
    retrievedAt: "2026-09-13",
    originalSha256: "65c3ca0866ed941425b9a7cf0fcf4c8ea21b36975862bfd79bedf6a73deaa7ac",
    derivativeSha256: "c03d8c556b73b0d6c0528fca704bb0855364906a2d8f8008920230aba0d8864d",
    rights: {
      status: "public-domain",
      label: "Public Domain Mark 1.0",
      basis: "The Wikimedia Commons file record marks this eighteenth-century engraving as public domain.",
      url: PUBLIC_DOMAIN_MARK,
    },
  },
  {
    author: "Thomas Paine",
    image: thomasPainePortrait,
    assetFileName: "thomas-paine.webp",
    kind: "historical-portrait",
    crop: { focusX: 50, focusY: 31, zoom: 1.5 },
    creator: "Laurent Dabos",
    date: "circa 1792",
    credit: "Laurent Dabos / National Portrait Gallery, Smithsonian Institution, CC0",
    sourcePage: "https://commons.wikimedia.org/wiki/File:Portrait_of_Thomas_Paine.jpg",
    originalFileUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c4/Portrait_of_Thomas_Paine.jpg",
    retrievedAt: "2026-09-13",
    originalSha256: "fcb98ee3a2fc86fdc821ed3296e034e9f42dd2456ee380e3d64da1f9334280d3",
    derivativeSha256: "ec66043706a56e10bc58735f76264be7022886e093fa4dd3a4dde57793c4bc90",
    rights: {
      status: "cc0",
      label: "CC0 1.0",
      basis: "The Smithsonian Institution and Wikimedia Commons identify this Open Access image as CC0.",
      url: CC0,
    },
  },
];
