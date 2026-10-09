/**
 * Turns a typed Bible reference ("John 3:16", "1 Cor. 13:4-7", "Matt 24:3, 14")
 * into links that open the exact passage on JW.org.
 *
 * JW.org's own public "finder" address takes an 8-digit passage code —
 * BBCCCVVV (book number, chapter, verse) — and sends the reader to that
 * chapter with the verses highlighted, in the chosen language:
 *
 *   https://www.jw.org/finder?wtlocale=E&bible=43003016   (John 3:16)
 *   https://www.jw.org/finder?wtlocale=E&bible=43003016-43003018  (a range)
 *
 * (Checked against the live site: single verses, ranges, Old and New
 * Testament, other languages and one-chapter books all resolve. A comma list
 * only opens the first verse, so "Matt 24:3, 14" becomes two links.)
 *
 * Only the reference is stored and linked — no scripture text or publication
 * content is ever copied. All URL building lives in `finderUrl`, so if JW.org
 * ever changes the address format it is a one-place fix.
 */

/** JW.org language code. English for now; more can be added without changing callers. */
export type JwLocale = "E";
export const DEFAULT_LOCALE: JwLocale = "E";

interface Book {
  n: number;
  name: string;
  /** Number of chapters — used to reject references that cannot exist. */
  chapters: number;
  /** Abbreviations / spellings without any leading number, e.g. "sam", "sa". */
  aliases: string[];
}

const BOOKS: Book[] = [
  { n: 1, name: "Genesis", chapters: 50, aliases: ["gen", "ge", "gn"] },
  { n: 2, name: "Exodus", chapters: 40, aliases: ["ex", "exo", "exod"] },
  { n: 3, name: "Leviticus", chapters: 27, aliases: ["lev", "le", "lv"] },
  { n: 4, name: "Numbers", chapters: 36, aliases: ["num", "nu", "nm", "nb"] },
  { n: 5, name: "Deuteronomy", chapters: 34, aliases: ["deut", "de", "dt"] },
  { n: 6, name: "Joshua", chapters: 24, aliases: ["josh", "jos", "jsh"] },
  { n: 7, name: "Judges", chapters: 21, aliases: ["judg", "jg", "jdg"] },
  { n: 8, name: "Ruth", chapters: 4, aliases: ["ru", "rth"] },
  { n: 9, name: "1 Samuel", chapters: 31, aliases: ["samuel", "sam", "sa", "sm"] },
  { n: 10, name: "2 Samuel", chapters: 24, aliases: ["samuel", "sam", "sa", "sm"] },
  { n: 11, name: "1 Kings", chapters: 22, aliases: ["kings", "kgs", "ki", "kin"] },
  { n: 12, name: "2 Kings", chapters: 25, aliases: ["kings", "kgs", "ki", "kin"] },
  { n: 13, name: "1 Chronicles", chapters: 29, aliases: ["chronicles", "chron", "chr", "ch"] },
  { n: 14, name: "2 Chronicles", chapters: 36, aliases: ["chronicles", "chron", "chr", "ch"] },
  { n: 15, name: "Ezra", chapters: 10, aliases: ["ezr"] },
  { n: 16, name: "Nehemiah", chapters: 13, aliases: ["neh", "ne"] },
  { n: 17, name: "Esther", chapters: 10, aliases: ["esth", "es"] },
  { n: 18, name: "Job", chapters: 42, aliases: ["jb"] },
  { n: 19, name: "Psalms", chapters: 150, aliases: ["psalm", "ps", "psa", "pslm", "psm"] },
  { n: 20, name: "Proverbs", chapters: 31, aliases: ["prov", "pr", "prv"] },
  { n: 21, name: "Ecclesiastes", chapters: 12, aliases: ["eccl", "eccles", "ec", "ecc"] },
  {
    n: 22,
    name: "Song of Solomon",
    chapters: 8,
    aliases: ["songofsolomon", "songofsongs", "song", "sos", "ca", "cant", "canticles"],
  },
  { n: 23, name: "Isaiah", chapters: 66, aliases: ["isa", "is"] },
  { n: 24, name: "Jeremiah", chapters: 52, aliases: ["jer", "je"] },
  { n: 25, name: "Lamentations", chapters: 5, aliases: ["lam", "la"] },
  { n: 26, name: "Ezekiel", chapters: 48, aliases: ["ezek", "eze", "ezk"] },
  { n: 27, name: "Daniel", chapters: 12, aliases: ["dan", "da", "dn"] },
  { n: 28, name: "Hosea", chapters: 14, aliases: ["hos", "ho"] },
  { n: 29, name: "Joel", chapters: 3, aliases: ["joe", "jl"] },
  { n: 30, name: "Amos", chapters: 9, aliases: ["am"] },
  { n: 31, name: "Obadiah", chapters: 1, aliases: ["obad", "ob"] },
  { n: 32, name: "Jonah", chapters: 4, aliases: ["jon", "jnh"] },
  { n: 33, name: "Micah", chapters: 7, aliases: ["mic", "mi"] },
  { n: 34, name: "Nahum", chapters: 3, aliases: ["nah", "na"] },
  { n: 35, name: "Habakkuk", chapters: 3, aliases: ["hab"] },
  { n: 36, name: "Zephaniah", chapters: 3, aliases: ["zeph", "zep"] },
  { n: 37, name: "Haggai", chapters: 2, aliases: ["hag"] },
  { n: 38, name: "Zechariah", chapters: 14, aliases: ["zech", "zec"] },
  { n: 39, name: "Malachi", chapters: 4, aliases: ["mal"] },
  { n: 40, name: "Matthew", chapters: 28, aliases: ["matt", "mat", "mt"] },
  { n: 41, name: "Mark", chapters: 16, aliases: ["mar", "mk", "mr"] },
  { n: 42, name: "Luke", chapters: 24, aliases: ["luk", "lu", "lk"] },
  { n: 43, name: "John", chapters: 21, aliases: ["joh", "jn", "jhn"] },
  { n: 44, name: "Acts", chapters: 28, aliases: ["act", "ac"] },
  { n: 45, name: "Romans", chapters: 16, aliases: ["rom", "ro", "rm"] },
  { n: 46, name: "1 Corinthians", chapters: 16, aliases: ["corinthians", "cor", "co"] },
  { n: 47, name: "2 Corinthians", chapters: 13, aliases: ["corinthians", "cor", "co"] },
  { n: 48, name: "Galatians", chapters: 6, aliases: ["gal", "ga"] },
  { n: 49, name: "Ephesians", chapters: 6, aliases: ["eph", "ep"] },
  { n: 50, name: "Philippians", chapters: 4, aliases: ["phil", "php", "pp"] },
  { n: 51, name: "Colossians", chapters: 4, aliases: ["col"] },
  { n: 52, name: "1 Thessalonians", chapters: 5, aliases: ["thessalonians", "thess", "thes", "th"] },
  { n: 53, name: "2 Thessalonians", chapters: 3, aliases: ["thessalonians", "thess", "thes", "th"] },
  { n: 54, name: "1 Timothy", chapters: 6, aliases: ["timothy", "tim", "ti"] },
  { n: 55, name: "2 Timothy", chapters: 4, aliases: ["timothy", "tim", "ti"] },
  { n: 56, name: "Titus", chapters: 3, aliases: ["tit"] },
  { n: 57, name: "Philemon", chapters: 1, aliases: ["philem", "phm", "phlm"] },
  { n: 58, name: "Hebrews", chapters: 13, aliases: ["heb"] },
  { n: 59, name: "James", chapters: 5, aliases: ["jas", "jam", "jm"] },
  { n: 60, name: "1 Peter", chapters: 5, aliases: ["peter", "pet", "pe", "pt"] },
  { n: 61, name: "2 Peter", chapters: 3, aliases: ["peter", "pet", "pe", "pt"] },
  { n: 62, name: "1 John", chapters: 5, aliases: ["john", "joh", "jn", "jhn"] },
  { n: 63, name: "2 John", chapters: 1, aliases: ["john", "joh", "jn", "jhn"] },
  { n: 64, name: "3 John", chapters: 1, aliases: ["john", "joh", "jn", "jhn"] },
  { n: 65, name: "Jude", chapters: 1, aliases: ["jud", "jde"] },
  { n: 66, name: "Revelation", chapters: 22, aliases: ["rev", "re", "revelations", "rv"] },
];

/** normalised spelling -> book. Numbered books are keyed with their digit ("1sam"). */
const BOOK_INDEX: Map<string, Book> = (() => {
  const map = new Map<string, Book>();
  for (const book of BOOKS) {
    const digit = /^[1-3]/.test(book.name) ? book.name[0] : "";
    const bare = book.name.replace(/^[1-3]\s+/, "").toLowerCase().replace(/\s+/g, "");
    for (const key of [bare, ...book.aliases]) {
      map.set(digit + key, book);
    }
  }
  return map;
})();

const ORDINALS: Record<string, string> = {
  "1st": "1",
  first: "1",
  i: "1",
  "2nd": "2",
  second: "2",
  ii: "2",
  "3rd": "3",
  third: "3",
  iii: "3",
};

/** Book numbers in the 8-digit code are two digits, chapter and verse three. */
function code(book: number, chapter: number, verse: number): string {
  return (
    String(book).padStart(2, "0") +
    String(chapter).padStart(3, "0") +
    String(verse).padStart(3, "0")
  );
}

/** The one place a JW.org address is built. */
function finderUrl(from: string, to: string | null, locale: JwLocale): string {
  const passage = to && to !== from ? `${from}-${to}` : from;
  return `https://www.jw.org/finder?wtlocale=${locale}&bible=${passage}`;
}

function findBook(numeral: string | undefined, word: string): Book | null {
  let digit = "";
  if (numeral) digit = ORDINALS[numeral.toLowerCase()] ?? numeral;
  const key = digit + word.toLowerCase().replace(/[.\s]/g, "");
  return BOOK_INDEX.get(key) ?? null;
}

interface Segment {
  chapter: number;
  /** undefined = the whole chapter */
  verse?: number;
  endChapter?: number;
  endVerse?: number;
}

const MAX_VERSE = 176; // Psalm 119 is the longest chapter

/** "3:16-18, 20; 4:1" (the part after the book name) -> segments, or null if unreadable. */
function parseSpec(spec: string, book: Book): Segment[] | null {
  const clean = spec.replace(/[–—]/g, "-").replace(/\s+/g, "");
  if (!clean) return [{ chapter: 1 }];
  const segments: Segment[] = [];
  const singleChapter = book.chapters === 1;

  for (const group of clean.split(";")) {
    if (!group) continue;
    let chapter: number | null = singleChapter ? 1 : null;
    for (const part of group.split(",")) {
      if (!part) return null;
      let rest = part;
      if (rest.includes(":")) {
        const [c, ...after] = rest.split(":");
        if (!/^\d+$/.test(c) || after.length !== 1) {
          // "3:16-4:2" is the one legal second colon.
          const m = rest.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
          if (!m) return null;
          segments.push({
            chapter: Number(m[1]),
            verse: Number(m[2]),
            endChapter: Number(m[3]),
            endVerse: Number(m[4]),
          });
          chapter = Number(m[1]);
          continue;
        }
        chapter = Number(c);
        rest = after[0];
      } else if (chapter === null) {
        // A bare number with no verse context is a chapter (or chapter range).
        const m = rest.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) return null;
        segments.push({
          chapter: Number(m[1]),
          endChapter: m[2] ? Number(m[2]) : undefined,
        });
        continue;
      }
      const m = rest.match(/^(\d+)(?:-(\d+))?$/);
      if (!m || chapter === null) return null;
      segments.push({
        chapter,
        verse: Number(m[1]),
        endVerse: m[2] ? Number(m[2]) : undefined,
      });
    }
  }
  return segments.length ? segments : null;
}

function validSegment(s: Segment, book: Book): boolean {
  const okChapter = (c: number) => c >= 1 && c <= book.chapters;
  const okVerse = (v: number) => v >= 1 && v <= MAX_VERSE;
  if (!okChapter(s.chapter)) return false;
  if (s.endChapter !== undefined && (!okChapter(s.endChapter) || s.endChapter < s.chapter)) {
    return false;
  }
  if (s.verse !== undefined && !okVerse(s.verse)) return false;
  if (s.endVerse !== undefined) {
    if (!okVerse(s.endVerse)) return false;
    if (s.endChapter === undefined && s.verse !== undefined && s.endVerse < s.verse) {
      return false;
    }
  }
  return true;
}

function segmentLabel(book: Book, s: Segment): string {
  if (s.verse === undefined) {
    return `${book.name} ${s.chapter}${s.endChapter ? `-${s.endChapter}` : ""}`;
  }
  const start = `${book.name} ${s.chapter}:${s.verse}`;
  if (s.endChapter !== undefined && s.endVerse !== undefined) {
    return `${start}-${s.endChapter}:${s.endVerse}`;
  }
  return s.endVerse !== undefined ? `${start}-${s.endVerse}` : start;
}

function segmentUrl(book: Book, s: Segment, locale: JwLocale): string {
  if (s.verse === undefined) {
    // A whole chapter: from verse 1 to "the end" (JW.org clamps 999 to the last verse).
    return finderUrl(
      code(book.n, s.chapter, 1),
      code(book.n, s.chapter, 999),
      locale
    );
  }
  const from = code(book.n, s.chapter, s.verse);
  if (s.endChapter !== undefined && s.endVerse !== undefined) {
    return finderUrl(from, code(book.n, s.endChapter, s.endVerse), locale);
  }
  return finderUrl(
    from,
    s.endVerse !== undefined ? code(book.n, s.chapter, s.endVerse) : null,
    locale
  );
}

export interface ScriptureLink {
  label: string;
  url: string;
}

const REFERENCE_PATTERN =
  /^\s*(?:(1st|2nd|3rd|first|second|third|iii|ii|i)(?:\s+|\.\s*)|([1-3])\s*\.?\s*)?([A-Za-z][A-Za-z.\s]*?)\s*\.?\s*(\d[\d\s:,\-–—;]*)?\s*$/i;

/**
 * Links for one typed reference, or null when it can't be read confidently —
 * callers then show it as plain text rather than a link that goes nowhere
 * (or somewhere wrong).
 *
 * One passage keeps the user's own wording as its label. A list such as
 * "Matt 24:3, 14" becomes one link per passage, because JW.org opens only the
 * first verse of a comma list.
 */
export function scriptureLinks(
  reference: string,
  locale: JwLocale = DEFAULT_LOCALE
): ScriptureLink[] | null {
  const text = reference.trim();
  if (!text) return null;
  const m = text.match(REFERENCE_PATTERN);
  if (!m) return null;
  const book = findBook(m[1] ?? m[2], m[3]);
  if (!book) return null;
  const segments = parseSpec(m[4] ?? "", book);
  if (!segments || !segments.every((s) => validSegment(s, book))) return null;

  if (segments.length === 1) {
    return [{ label: text, url: segmentUrl(book, segments[0], locale) }];
  }
  return segments.map((s) => ({
    label: segmentLabel(book, s),
    url: segmentUrl(book, s, locale),
  }));
}
