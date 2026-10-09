import { describe, expect, it } from "vitest";
import { scriptureLinks } from "@/lib/scripture";

const url = (bible: string, locale = "E") =>
  `https://www.jw.org/finder?wtlocale=${locale}&bible=${bible}`;

const one = (ref: string) => {
  const links = scriptureLinks(ref);
  expect(links, ref).not.toBeNull();
  expect(links, ref).toHaveLength(1);
  return links![0];
};

describe("scriptureLinks — single passages", () => {
  it("links a verse to its exact 8-digit passage code", () => {
    expect(one("John 3:16").url).toBe(url("43003016"));
    expect(one("Psalm 83:18").url).toBe(url("19083018"));
    expect(one("Revelation 21:4").url).toBe(url("66021004"));
    expect(one("Genesis 1:1").url).toBe(url("01001001"));
  });

  it("keeps the user's own wording as the label", () => {
    expect(one("  Rev. 21:4 ").label).toBe("Rev. 21:4");
  });

  it("links a verse range", () => {
    expect(one("John 3:16-18").url).toBe(url("43003016-43003018"));
    expect(one("Phil 4:6–7").url).toBe(url("50004006-50004007"));
  });

  it("links a range across chapters", () => {
    expect(one("John 3:16-4:2").url).toBe(url("43003016-43004002"));
  });

  it("links a whole chapter from verse 1 to the end", () => {
    expect(one("Psalm 23").url).toBe(url("19023001-19023999"));
  });

  it("reads one-chapter books, where a lone number is a verse", () => {
    expect(one("Jude 3").url).toBe(url("65001003"));
    expect(one("Jude 1:3").url).toBe(url("65001003"));
    expect(one("Philemon 8").url).toBe(url("57001008"));
    expect(one("2 John 6").url).toBe(url("63001006"));
  });

  it("builds the address in the requested language", () => {
    expect(scriptureLinks("John 3:16", "E")![0].url).toContain("wtlocale=E");
  });
});

describe("scriptureLinks — book names", () => {
  it("accepts full names, abbreviations and any letter case", () => {
    for (const ref of ["Matthew 5:3", "Matt 5:3", "Mt 5:3", "matt. 5:3", "MATT 5:3"]) {
      expect(one(ref).url, ref).toBe(url("40005003"));
    }
  });

  it("reads numbered books however the number is written", () => {
    for (const ref of [
      "1 Corinthians 13:4",
      "1 Cor. 13:4",
      "1Cor 13:4",
      "I Corinthians 13:4",
      "First Corinthians 13:4",
      "1st Cor 13:4",
    ]) {
      expect(one(ref).url, ref).toBe(url("46013004"));
    }
    expect(one("2 Tim. 3:16").url).toBe(url("55003016"));
    expect(one("1 John 4:8").url).toBe(url("62004008"));
    expect(one("3 John 4").url).toBe(url("64001004"));
  });

  it("does not mistake books that start with I for a Roman numeral", () => {
    expect(one("Isaiah 9:6").url).toBe(url("23009006"));
    expect(one("Is 41:10").url).toBe(url("23041010"));
  });

  it("tells John from 1, 2 and 3 John, and Jude from Judges", () => {
    expect(one("John 1:1").url).toBe(url("43001001"));
    expect(one("1 John 1:1").url).toBe(url("62001001"));
    expect(one("Judges 6:12").url).toBe(url("07006012"));
    expect(one("Jude 24").url).toBe(url("65001024"));
  });

  it("reads multi-word book names", () => {
    expect(one("Song of Solomon 2:4").url).toBe(url("22002004"));
  });
});

describe("scriptureLinks — lists", () => {
  it("gives each verse in a comma list its own link", () => {
    const links = scriptureLinks("Matthew 24:3, 14")!;
    expect(links.map((l) => l.label)).toEqual(["Matthew 24:3", "Matthew 24:14"]);
    expect(links.map((l) => l.url)).toEqual([url("40024003"), url("40024014")]);
  });

  it("handles ranges and chapters inside a list", () => {
    const links = scriptureLinks("Daniel 2:44; 7:13, 14")!;
    expect(links.map((l) => l.label)).toEqual([
      "Daniel 2:44",
      "Daniel 7:13",
      "Daniel 7:14",
    ]);
    const mixed = scriptureLinks("Ps 23:1-3, 6")!;
    expect(mixed.map((l) => l.url)).toEqual([
      url("19023001-19023003"),
      url("19023006"),
    ]);
  });
});

describe("scriptureLinks — things it must not guess at", () => {
  it("returns null for text that is not a reference", () => {
    for (const ref of ["", "   ", "hope for the future", "Hezekiah 3:1", "42", "3:16"]) {
      expect(scriptureLinks(ref), JSON.stringify(ref)).toBeNull();
    }
  });

  it("returns null for chapters, verses or ranges that cannot exist", () => {
    for (const ref of [
      "John 99:1",
      "John 3:0",
      "John 3:500",
      "Jude 2:1",
      "John 3:18-16",
      "John 4:1-3:2",
    ]) {
      expect(scriptureLinks(ref), ref).toBeNull();
    }
  });

  it("returns null for a malformed list rather than a half-right link", () => {
    expect(scriptureLinks("John 3:16,")).toBeNull();
    expect(scriptureLinks("John 3:16-")).toBeNull();
  });
});
