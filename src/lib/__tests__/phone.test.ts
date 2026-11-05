import { describe, expect, it } from "vitest";
import { normalizeForCall, normalizeForWhatsApp } from "@/lib/phone";

describe("calling a person without saving them to the phone's contacts", () => {
  it("dials a local Uganda number in full international form", () => {
    expect(normalizeForCall("0772 123 456")).toEqual({ valid: true, telLink: "tel:+256772123456" });
  });

  it("dials a number already written with a country code", () => {
    expect(normalizeForCall("+256 772-123-456")).toEqual({ valid: true, telLink: "tel:+256772123456" });
  });

  it("still dials a number WhatsApp would not accept, as typed minus spaces and punctuation", () => {
    // Not a full mobile number: no WhatsApp link, but it can be called.
    expect(normalizeForWhatsApp("0414 12").valid).toBe(false);
    expect(normalizeForCall("0414 12")).toEqual({ valid: true, telLink: "tel:041412" });
    expect(normalizeForCall("+44 (0) 20 1234")).toEqual({ valid: true, telLink: "tel:+440201234" });
  });

  it("asks for a number when there is none, or it is too short to be one", () => {
    expect(normalizeForCall("")).toMatchObject({ valid: false, reason: "No phone number saved." });
    expect(normalizeForCall(null)).toMatchObject({ valid: false });
    expect(normalizeForCall("  ")).toMatchObject({ valid: false });
    expect(normalizeForCall("12")).toMatchObject({ valid: false });
    expect(normalizeForCall("abc")).toMatchObject({ valid: false });
  });

  it("never lets anything but digits (and a leading +) into the link", () => {
    const r = normalizeForCall("0414 12;rm -rf");
    expect(r).toMatchObject({ valid: true });
    expect(r.valid && r.telLink).toMatch(/^tel:\+?\d+$/);
  });
});
