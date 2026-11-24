import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLICATION, isDefaultPublication } from "@/lib/bible-study";

describe("the usual study brochure", () => {
  it("is Enjoy Life Forever!", () => {
    expect(DEFAULT_PUBLICATION).toBe("Enjoy Life Forever!");
  });

  it("is recognised however it was typed", () => {
    for (const text of ["Enjoy Life Forever!", "enjoy life forever!", "  Enjoy   Life Forever!  "]) {
      expect(isDefaultPublication(text)).toBe(true);
    }
  });

  it("is not mistaken for anything else, or for nothing", () => {
    for (const text of ["", "   ", null, undefined, "Enjoy Life Forever", "Another brochure", "Why God allows suffering"]) {
      expect(isDefaultPublication(text)).toBe(false);
    }
  });
});
