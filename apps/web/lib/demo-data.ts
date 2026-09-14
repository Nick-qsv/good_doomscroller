type DemoPassage = {
  id: string;
  text: string;
  author: string;
  bookTitle: string;
  publicationYear: number;
  chapterTitle: string | null;
  sourceUrl: string;
  themes: string[];
  editionId: string;
  sourceSha256: string;
  sourcePassageId: string;
};

// Copied from the exact editions reviewed on 2026-09-13, with source identity
// retained for drift checks. Demo IDs do not claim production receipt history.
// Rebuild from approved corpus selections after any edition change.
export const demoPassages: readonly DemoPassage[] = [
  {
    "id": "demo-autobiography-of-charles-darwin-01",
    "text": "I can say in my own favour that I was as a boy humane, but I owed this entirely to the instruction and example of my sisters. I doubt indeed whether humanity is a natural or innate quality.",
    "author": "Charles Darwin",
    "bookTitle": "The Autobiography of Charles Darwin",
    "publicationYear": 1887,
    "chapterTitle": "Chapter 1",
    "sourceUrl": "https://www.gutenberg.org/ebooks/2010",
    "themes": [
      "compassion",
      "education"
    ],
    "editionId": "9640f338-8d93-5501-bbef-6f9a00e9e556",
    "sourceSha256": "7e2937e414d27ec2ee9bced09e1f9066191732aeaa15cc44ad9d85d687d8d00b",
    "sourcePassageId": "bb98838a-bd88-5134-9603-3d697b4e1f13"
  },
  {
    "id": "demo-autobiography-of-charles-darwin-02",
    "text": "Looking back as well as I can at my character during my school life, the only qualities which at this period promised well for the future, were, that I had strong and diversified tastes, much zeal for whatever interested me, and a keen pleasure in understanding any complex subject or thing. I was taught Euclid by a private tutor, and I distinctly remember the intense satisfaction which the clear geometrical proofs gave me.",
    "author": "Charles Darwin",
    "bookTitle": "The Autobiography of Charles Darwin",
    "publicationYear": 1887,
    "chapterTitle": "Chapter 1",
    "sourceUrl": "https://www.gutenberg.org/ebooks/2010",
    "themes": [
      "curiosity",
      "education"
    ],
    "editionId": "9640f338-8d93-5501-bbef-6f9a00e9e556",
    "sourceSha256": "7e2937e414d27ec2ee9bced09e1f9066191732aeaa15cc44ad9d85d687d8d00b",
    "sourcePassageId": "b1648089-255f-51bd-afc9-906532ae3779"
  },
  {
    "id": "demo-chemical-history-of-a-candle-01",
    "text": "There is no better, there is no more open door by which you can enter into the study of natural philosophy, than by considering the physical phenomena of a candle.",
    "author": "Michael Faraday",
    "bookTitle": "The Chemical History of a Candle",
    "publicationYear": 1861,
    "chapterTitle": "The Project Gutenberg eBook of The Chemical History of a Candle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/14474",
    "themes": [
      "knowledge",
      "nature"
    ],
    "editionId": "413ea5f8-2d09-52ef-8022-cbdd2f5d8771",
    "sourceSha256": "4803964d793299a40ece442cadcd2ca3e4b6411c428acd8590efe6fd93dd4ee8",
    "sourcePassageId": "c4ce4a18-7c87-5cb6-a47f-699ba1485e35"
  },
  {
    "id": "demo-chemical-history-of-a-candle-02",
    "text": "As the air comes to the candle it moves upwards by the force of the current which the heat of the candle produces, and it so cools all the sides of the wax, tallow, or fuel, as to keep the edge much cooler than the part within; the part within melts by the flame that runs down the wick as far as it can go before it is extinguished, but the part on the outside does not melt.",
    "author": "Michael Faraday",
    "bookTitle": "The Chemical History of a Candle",
    "publicationYear": 1861,
    "chapterTitle": "The Project Gutenberg eBook of The Chemical History of a Candle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/14474",
    "themes": [
      "knowledge",
      "nature"
    ],
    "editionId": "413ea5f8-2d09-52ef-8022-cbdd2f5d8771",
    "sourceSha256": "4803964d793299a40ece442cadcd2ca3e4b6411c428acd8590efe6fd93dd4ee8",
    "sourcePassageId": "81f2bfa7-f275-58b5-ad12-ed02a31900b4"
  },
  {
    "id": "demo-frankenstein-1818-01",
    "text": "I learned from Werter’s imaginations despondency and gloom: but Plutarch taught me high thoughts; he elevated me above the wretched sphere of my own reflections, to admire and love the heroes of past ages. Many things I read surpassed my understanding and experience.",
    "author": "Mary Wollstonecraft Shelley",
    "bookTitle": "Frankenstein; Or, The Modern Prometheus (1818)",
    "publicationYear": 1818,
    "chapterTitle": "CHAPTER VII.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/41445",
    "themes": [
      "knowledge",
      "love",
      "time"
    ],
    "editionId": "9ebbdb49-4fd3-5c9b-bfd1-7cd30f57fcc8",
    "sourceSha256": "7675ae250ac9c81d962e46af0573281d6a282ef0120b0db945b33eef726b16c9",
    "sourcePassageId": "fe293a46-6ab7-50c1-99d2-566775985907"
  },
  {
    "id": "demo-frankenstein-1818-02",
    "text": "A selfish pursuit had cramped and narrowed me, until your gentleness and affection warmed and opened my senses; I became the same happy creature who, a few years ago, loving and beloved by all, had no sorrow or care.",
    "author": "Mary Wollstonecraft Shelley",
    "bookTitle": "Frankenstein; Or, The Modern Prometheus (1818)",
    "publicationYear": 1818,
    "chapterTitle": "CHAPTER V.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/41445",
    "themes": [
      "identity",
      "love",
      "time"
    ],
    "editionId": "9ebbdb49-4fd3-5c9b-bfd1-7cd30f57fcc8",
    "sourceSha256": "7675ae250ac9c81d962e46af0573281d6a282ef0120b0db945b33eef726b16c9",
    "sourcePassageId": "0430d590-77dc-5019-a9e6-81380af5441a"
  },
  {
    "id": "demo-incidents-in-the-life-of-a-slave-girl-01",
    "text": "The reader probably knows that no promise or writing given to a slave is legally binding; for, according to Southern laws, a slave, _being_ property, can _hold_ no property. When my grandmother lent her hard earnings to her mistress, she trusted solely to her honor. The honor of a slaveholder to a slave!",
    "author": "Harriet A. Jacobs",
    "bookTitle": "Incidents in the Life of a Slave Girl, Written by Herself",
    "publicationYear": 1861,
    "chapterTitle": "Chapter 1",
    "sourceUrl": "https://www.gutenberg.org/ebooks/11030",
    "themes": [
      "slavery",
      "injustice"
    ],
    "editionId": "69d368ad-18ae-51f8-9104-63a8bb344817",
    "sourceSha256": "a8ea7fd9177aebd3b6534d9e67f78973e01686e073f156214e54884e1b6e328a",
    "sourcePassageId": "bfbd4ed1-192a-528f-8886-05a9baa111c4"
  },
  {
    "id": "demo-incidents-in-the-life-of-a-slave-girl-02",
    "text": "After a brief period of suspense, the will of my mistress was read, and we learned that she had bequeathed me to her sister’s daughter, a child of five years old. So vanished our hopes. My mistress had taught me the precepts of God’s Word: “Thou shalt love thy neighbor as thyself.” “Whatsoever ye would that men should do unto you, do ye even so unto them.” But I was her slave, and I suppose she did not recognize me as her neighbor.",
    "author": "Harriet A. Jacobs",
    "bookTitle": "Incidents in the Life of a Slave Girl, Written by Herself",
    "publicationYear": 1861,
    "chapterTitle": "Chapter 1",
    "sourceUrl": "https://www.gutenberg.org/ebooks/11030",
    "themes": [
      "slavery",
      "hypocrisy"
    ],
    "editionId": "69d368ad-18ae-51f8-9104-63a8bb344817",
    "sourceSha256": "a8ea7fd9177aebd3b6534d9e67f78973e01686e073f156214e54884e1b6e328a",
    "sourcePassageId": "f702af40-372f-5dd1-804e-eb5efde56a09"
  },
  {
    "id": "demo-letters-of-charles-dickens-volume-1-01",
    "text": "I cannot tell you how much pleasure I have derived from the receipt of your letter. I have heard little of you, and seen less, for so long a time, that your handwriting came like the renewal of some old friendship, and gladdened my eyes like the face of some old friend.",
    "author": "Charles Dickens",
    "bookTitle": "The Letters of Charles Dickens. Vol. 1, 1833-1856",
    "publicationYear": 1880,
    "chapterTitle": "Book I.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/25852",
    "themes": [
      "friendship",
      "connection"
    ],
    "editionId": "8ceba576-e5ca-5b5d-918f-f1e9a0c96674",
    "sourceSha256": "1907061a30e3bff28ac16e60462b5a51f61aad090a923c09318dc57f336ea124",
    "sourcePassageId": "8438365b-04b3-5d8d-a454-53ef4cb801f7"
  },
  {
    "id": "demo-letters-of-charles-dickens-volume-1-02",
    "text": "I feel more true and cordial pleasure than I can express to you in the request you have made. Anything which can serve to commemorate our friendship and to keep the recollection of it alive among our children is, believe me, and ever will be, most deeply prized by me.",
    "author": "Charles Dickens",
    "bookTitle": "The Letters of Charles Dickens. Vol. 1, 1833-1856",
    "publicationYear": 1880,
    "chapterTitle": "Book I.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/25852",
    "themes": [
      "friendship",
      "family"
    ],
    "editionId": "8ceba576-e5ca-5b5d-918f-f1e9a0c96674",
    "sourceSha256": "1907061a30e3bff28ac16e60462b5a51f61aad090a923c09318dc57f336ea124",
    "sourcePassageId": "3a2a8746-8a99-54e0-8f42-a16a769e3d5c"
  },
  {
    "id": "demo-life-of-mozart-01",
    "text": "He learned every task that his father gave him, and put his soul so entirely into whatever he was doing that he forgot all else for the time being, not excepting even his music.",
    "author": "Ludwig Nohl",
    "bookTitle": "Life of Mozart",
    "publicationYear": 1880,
    "chapterTitle": "CHAPTER I.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/67828",
    "themes": [
      "knowledge",
      "identity"
    ],
    "editionId": "01d63e58-5084-5fa8-8e5a-a959afeed945",
    "sourceSha256": "b1f5f93230c59aab23d58222ce662251cb540920fb7f240a66785c4443c355ec",
    "sourcePassageId": "fb8634b3-c80f-538b-9128-122b15931cc2"
  },
  {
    "id": "demo-life-of-mozart-02",
    "text": "The journey taken thus early in life was of great advantage to Mozart himself. He learned to understand men--for his father drew his attention to everything; he even made the boy keep a diary--he got rid of the shyness natural to children, and acquired a knowledge of life. He had listened to the music of the different nations, and thus discovered the manner in which each heart understands that language of the human soul called melody.",
    "author": "Ludwig Nohl",
    "bookTitle": "Life of Mozart",
    "publicationYear": 1880,
    "chapterTitle": "CHAPTER I.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/67828",
    "themes": [
      "knowledge",
      "society"
    ],
    "editionId": "01d63e58-5084-5fa8-8e5a-a959afeed945",
    "sourceSha256": "b1f5f93230c59aab23d58222ce662251cb540920fb7f240a66785c4443c355ec",
    "sourcePassageId": "b9fd2ec9-ba89-5985-8ae9-9c5aae7982fd"
  },
  {
    "id": "demo-narrative-of-frederick-douglass-01",
    "text": "By far the larger part of the slaves know as little of their ages as horses know of theirs, and it is the wish of most masters within my knowledge to keep their slaves thus ignorant.",
    "author": "Frederick Douglass",
    "bookTitle": "Narrative of the Life of Frederick Douglass, an American Slave",
    "publicationYear": 1845,
    "chapterTitle": "CHAPTER I",
    "sourceUrl": "https://www.gutenberg.org/ebooks/23",
    "themes": [
      "identity",
      "knowledge"
    ],
    "editionId": "24c25efc-2c72-53f0-a44b-24830541c051",
    "sourceSha256": "234c15348a66919bad1d534cdd48ee8ddf91f50115a706cbefaa8edd049672fd",
    "sourcePassageId": "5d7d76f7-21d3-59bd-af8f-0a07883d1c3e"
  },
  {
    "id": "demo-tao-teh-king-james-legge-01",
    "text": "The Tao that can be trodden is not the enduring and unchanging Tao. The name that can be named is not the enduring and unchanging name.",
    "author": "Laozi",
    "bookTitle": "The Tao Teh King, or the Tao and its Characteristics",
    "publicationYear": 1891,
    "chapterTitle": "PART 1.",
    "sourceUrl": "https://www.gutenberg.org/ebooks/216",
    "themes": [
      "language",
      "philosophy"
    ],
    "editionId": "ce36643f-a2fe-5032-9582-083581b9a0a9",
    "sourceSha256": "041568f8dfef3ac6c2deb7699756f9d26d6aa8669647f4ce611b0ed4a95b0db6",
    "sourcePassageId": "e177f680-1357-5d5f-b9c2-941651ff047e"
  }
] as const;
