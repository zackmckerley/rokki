import { describe, it, expect } from "vitest";
import { parseContact, splitName } from "./parse";

describe("splitName", () => {
  it("first + last", () => {
    expect(splitName("Carlos Mendez")).toEqual({
      first_name: "Carlos",
      last_name: "Mendez",
    });
  });
  it("first middle last", () => {
    expect(splitName("Ana Maria Gonzalez")).toEqual({
      first_name: "Ana",
      middle_name: "Maria",
      last_name: "Gonzalez",
    });
  });
  it("Last, First", () => {
    expect(splitName("Mendez, Carlos")).toEqual({
      first_name: "Carlos",
      last_name: "Mendez",
    });
  });
  it("prefix + suffix", () => {
    expect(splitName("Dr. Robert King Jr.")).toEqual({
      prefix: "Dr.",
      first_name: "Robert",
      last_name: "King",
      suffix: "Jr.",
    });
  });
  it("single token", () => {
    expect(splitName("Cher")).toEqual({ first_name: "Cher" });
  });
  it("apostrophes + hyphens", () => {
    expect(splitName("Jean-Luc O'Brien")).toEqual({
      first_name: "Jean-Luc",
      last_name: "O'Brien",
    });
  });
});

describe("parseContact — email signature", () => {
  const sig = `Carlos Mendez
Senior Broker, Compass Real Estate
carlos.mendez@compass.com
Mobile: (305) 555-0142
Office: 305-555-0100
www.compass.com`;

  const r = parseContact(sig);

  it("extracts the name", () => {
    expect(r.first_name).toBe("Carlos");
    expect(r.last_name).toBe("Mendez");
  });
  it("extracts title + company", () => {
    expect(r.title).toMatch(/Senior Broker/i);
    expect(r.company).toMatch(/Compass Real Estate/i);
  });
  it("extracts the email", () => {
    expect(r.emails).toHaveLength(1);
    expect(r.emails[0].email).toBe("carlos.mendez@compass.com");
  });
  it("extracts both phones with labels", () => {
    expect(r.phones).toHaveLength(2);
    const mobile = r.phones.find((p) => p.label === "mobile");
    const work = r.phones.find((p) => p.label === "work");
    expect(mobile?.phone).toContain("305");
    expect(work?.phone).toContain("305");
  });
  it("captures the website as a social", () => {
    expect(r.socials.some((s) => s.kind === "website")).toBe(true);
  });
});

describe("parseContact — labeled key/value block", () => {
  const block = `Name: Ana Gonzalez
Company: Brickell Capital Partners
Title: Managing Director
Email: ana@brickellcap.com
Work Phone: (786) 555-2200
Cell: 786-555-9999
Birthday: 03/14/1985
Address: 1450 Brickell Ave, Suite 1900
Miami, FL 33131
LinkedIn: linkedin.com/in/anagonzalez`;

  const r = parseContact(block);

  it("name", () => {
    expect(r.first_name).toBe("Ana");
    expect(r.last_name).toBe("Gonzalez");
  });
  it("company + title", () => {
    expect(r.company).toBe("Brickell Capital Partners");
    expect(r.title).toBe("Managing Director");
  });
  it("email", () => {
    expect(r.emails[0].email).toBe("ana@brickellcap.com");
  });
  it("two phones, correct labels", () => {
    expect(r.phones.find((p) => p.label === "work")?.phone).toContain("786");
    expect(r.phones.find((p) => p.label === "mobile")?.phone).toContain("786");
  });
  it("birthday → ISO", () => {
    expect(r.birthday).toBe("1985-03-14");
  });
  it("address line + city/state/zip merged", () => {
    expect(r.addresses).toHaveLength(1);
    expect(r.addresses[0].line1).toMatch(/Brickell Ave/);
    expect(r.addresses[0].city).toBe("Miami");
    expect(r.addresses[0].state).toBe("FL");
    expect(r.addresses[0].postal).toBe("33131");
  });
  it("linkedin social", () => {
    expect(r.socials.find((s) => s.kind === "linkedin")?.value).toContain(
      "anagonzalez",
    );
  });
});

describe("parseContact — Apple contact-card copy (label-then-value)", () => {
  const card = `John Patel
Sunrise Properties LLC
mobile
(954) 555-3000
work
john@sunriseprops.com`;
  const r = parseContact(card);

  it("name + company", () => {
    expect(r.first_name).toBe("John");
    expect(r.last_name).toBe("Patel");
    expect(r.company).toMatch(/Sunrise Properties/i);
  });
  it("phone takes preceding standalone label", () => {
    expect(r.phones[0].label).toBe("mobile");
    expect(r.phones[0].phone).toContain("954");
  });
  it("email takes preceding standalone label", () => {
    expect(r.emails[0].label).toBe("work");
    expect(r.emails[0].email).toBe("john@sunriseprops.com");
  });
});

describe("parseContact — vCard", () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
N:Reyes;Maria;Elena;Ms.;
FN:Ms. Maria Elena Reyes
ORG:Coastal Title Group;
TITLE:Closing Officer
EMAIL;TYPE=WORK:maria@coastaltitle.com
EMAIL;TYPE=HOME:mreyes@gmail.com
TEL;TYPE=CELL:+1-305-555-7777
TEL;TYPE=WORK:(305) 555-8888
ADR;TYPE=WORK:;;200 S Biscayne Blvd;Miami;FL;33131;USA
BDAY:1979-11-02
URL:https://coastaltitle.com
END:VCARD`;
  const r = parseContact(vcf);

  it("structured N name", () => {
    expect(r.first_name).toBe("Maria");
    expect(r.middle_name).toBe("Elena");
    expect(r.last_name).toBe("Reyes");
    expect(r.prefix).toBe("Ms.");
  });
  it("org + title", () => {
    expect(r.company).toBe("Coastal Title Group");
    expect(r.title).toBe("Closing Officer");
  });
  it("two emails w/ labels", () => {
    expect(r.emails).toHaveLength(2);
    expect(r.emails.find((e) => e.label === "work")?.email).toBe(
      "maria@coastaltitle.com",
    );
    expect(r.emails.find((e) => e.label === "personal")?.email).toBe(
      "mreyes@gmail.com",
    );
  });
  it("two phones w/ labels", () => {
    expect(r.phones.find((p) => p.label === "mobile")?.phone).toContain("305");
    expect(r.phones.find((p) => p.label === "work")?.phone).toContain("305");
  });
  it("address", () => {
    expect(r.addresses[0].line1).toBe("200 S Biscayne Blvd");
    expect(r.addresses[0].city).toBe("Miami");
    expect(r.addresses[0].state).toBe("FL");
    expect(r.addresses[0].postal).toBe("33131");
  });
  it("birthday + website", () => {
    expect(r.birthday).toBe("1979-11-02");
    expect(r.socials.find((s) => s.kind === "website")?.value).toContain(
      "coastaltitle.com",
    );
  });
});

describe("parseContact — birthday parsing (no fabricated day)", () => {
  it("month + year with NO day does not invent one", () => {
    expect(parseContact("Birthday: September 2024").birthday).toBeUndefined();
    expect(parseContact("Birthday: May 1985").birthday).toBeUndefined();
  });
  it("Month D, YYYY parses fully", () => {
    expect(parseContact("Birthday: March 9, 1985").birthday).toBe("1985-03-09");
  });
  it("year-less Month D → 0000 sentinel", () => {
    expect(parseContact("Birthday: March 9").birthday).toBe("0000-03-09");
  });
});

describe("parseContact — socials are per-platform", () => {
  it("same handle on two platforms is not deduped", () => {
    const r = parseContact("Instagram: john\nTwitter: john");
    const kinds = r.socials.map((s) => s.kind).sort();
    expect(r.socials).toHaveLength(2);
    expect(kinds).toEqual(["instagram", "x"]);
  });
});

describe("parseContact — dedupe + robustness", () => {
  it("dedupes repeated email/phone", () => {
    const r = parseContact(
      "Bob Lee\nbob@x.com\nbob@x.com\n(305) 555-1212\n305-555-1212",
    );
    expect(r.emails).toHaveLength(1);
    expect(r.phones).toHaveLength(1);
  });
  it("empty input → empty result", () => {
    const r = parseContact("   \n  \n");
    expect(r.emails).toHaveLength(0);
    expect(r.phones).toHaveLength(0);
    expect(r.first_name).toBeUndefined();
  });
  it("bare email only", () => {
    const r = parseContact("someone@nowhere.com");
    expect(r.emails[0].email).toBe("someone@nowhere.com");
  });
  it("does not treat a zip code as a phone", () => {
    const r = parseContact("Jane Doe\n123 Main St\nMiami, FL 33133");
    expect(r.phones).toHaveLength(0);
    expect(r.addresses[0].postal).toBe("33133");
  });
  it("unclassifiable lines go to unmatched, not into fields", () => {
    const r = parseContact("Tom Ray\nSome random tagline here that means nothing");
    expect(r.first_name).toBe("Tom");
    expect(r.unmatched.length).toBeGreaterThan(0);
  });
});

describe("parseContact — adversarial edge cases", () => {
  it("company-only blob does not invent a person name", () => {
    const r = parseContact("Brickell Capital Partners LLC\ninfo@brickellcap.com");
    expect(r.first_name).toBeUndefined();
    expect(r.last_name).toBeUndefined();
    expect(r.company).toMatch(/Brickell Capital Partners/);
    expect(r.emails[0].email).toBe("info@brickellcap.com");
  });
  it('"Last, First" on the name line of a signature', () => {
    const r = parseContact("Mendez, Carlos\nBroker\ncarlos@x.com");
    expect(r.first_name).toBe("Carlos");
    expect(r.last_name).toBe("Mendez");
  });
  it("two phones on a single line are both captured", () => {
    const r = parseContact("Pat Gomez\nO: (305) 555-1000  C: (305) 555-2000");
    expect(r.phones).toHaveLength(2);
  });
  it("an ISO date in the text is not mistaken for a phone", () => {
    const r = parseContact("Notes: contract signed 2026-06-30\njoe@x.com");
    expect(r.phones).toHaveLength(0);
  });
  it("classifies socials by host, not substring (CodeQL: incomplete URL check)", () => {
    const fb = parseContact("Web: https://facebook.com/acme");
    expect(fb.socials.find((s) => s.kind === "facebook")?.value).toContain("facebook.com");
    // A host that merely contains "fb.com" in its path must NOT be facebook.
    const evil = parseContact("Web: https://evil.com/fb.com/phish");
    expect(evil.socials.some((s) => s.kind === "facebook")).toBe(false);
    expect(evil.socials.some((s) => s.kind === "website")).toBe(true);
    expect(parseContact("https://x.com/jack").socials[0].kind).toBe("x");
  });
  it("does not crash on punctuation-only / unicode input", () => {
    expect(() => parseContact("———\n••• \n☃️")).not.toThrow();
    expect(() => parseContact("José Niño-García\njose@x.com")).not.toThrow();
    const r = parseContact("José Niño\njose@x.com");
    expect(r.first_name).toBe("José");
  });
});
