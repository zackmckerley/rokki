import { describe, it, expect } from "vitest";
import {
  mergeEmails,
  mergePhones,
  mergeAddresses,
  mergeSocials,
  addrKey,
  parseSummary,
} from "./merge";
import type { ParsedContact } from "./parse";

function parsed(over: Partial<ParsedContact>): ParsedContact {
  return { emails: [], phones: [], addresses: [], socials: [], unmatched: [], ...over };
}

describe("mergeEmails", () => {
  it("drops the seeded empty row and adds parsed", () => {
    const out = mergeEmails([{ label: "", email: "" }], [{ email: "a@x.com", label: "work" }]);
    expect(out).toEqual([{ label: "work", email: "a@x.com" }]);
  });
  it("keeps user-typed rows and appends new, deduping case-insensitively", () => {
    const out = mergeEmails(
      [{ label: "personal", email: "me@home.com" }],
      [{ email: "ME@HOME.com" }, { email: "new@work.com" }],
    );
    expect(out.map((e) => e.email)).toEqual(["me@home.com", "new@work.com"]);
  });
  it("returns an empty seed row when nothing is present", () => {
    expect(mergeEmails([{ label: "", email: "" }], [])).toEqual([{ label: "", email: "" }]);
  });
});

describe("mergePhones — format-insensitive dedupe (Finding 2)", () => {
  it("does not duplicate the same number written with +1", () => {
    const out = mergePhones(
      [{ label: "mobile", phone: "+1 305-555-0100" }],
      [{ phone: "(305) 555-0100", label: "work" }],
    );
    expect(out).toHaveLength(1);
  });
  it("treats an extension as the same base number", () => {
    const out = mergePhones(
      [{ label: "work", phone: "305-555-0100" }],
      [{ phone: "305-555-0100 x123" }],
    );
    expect(out).toHaveLength(1);
  });
  it("keeps genuinely different numbers", () => {
    const out = mergePhones(
      [{ label: "mobile", phone: "305-555-0100" }],
      [{ phone: "305-555-9999" }],
    );
    expect(out).toHaveLength(2);
  });
});

describe("mergeAddresses — line2/country preserved (Finding 3)", () => {
  it("keeps an address that carries ONLY a country", () => {
    const out = mergeAddresses([], [{ country: "Canada" }]);
    expect(out).toEqual([{ country: "Canada" }]);
  });
  it("keeps an address that carries ONLY line2", () => {
    const out = mergeAddresses([], [{ line2: "Suite 900" }]);
    expect(out).toHaveLength(1);
  });
  it("drops a fully-empty address", () => {
    const out = mergeAddresses([], [{}]);
    expect(out).toHaveLength(0);
  });
  it("dedupes identical addresses", () => {
    const a = { line1: "1 Main St", city: "Miami", state: "FL", postal: "33131" };
    const out = mergeAddresses([a], [{ ...a }]);
    expect(out).toHaveLength(1);
  });
  it("addrKey is empty-string-equivalent only when every part is blank", () => {
    expect(addrKey({}).replace(/\|/g, "")).toBe("");
    expect(addrKey({ country: "USA" }).replace(/\|/g, "")).not.toBe("");
  });
});

describe("merge helpers don't share references with the parser (Finding 1)", () => {
  it("mergeAddresses clones incoming objects", () => {
    const src = parsed({ addresses: [{ city: "Miami" }] });
    const out = mergeAddresses([], src.addresses);
    out[0].city = "Tampa";
    expect(src.addresses[0].city).toBe("Miami"); // source untouched
  });
  it("mergeSocials clones incoming objects", () => {
    const src = parsed({ socials: [{ kind: "website", value: "a.com" }] });
    const out = mergeSocials([], src.socials);
    out[0].value = "b.com";
    expect(src.socials[0].value).toBe("a.com");
  });
  it("merge helpers don't mutate the existing array", () => {
    const existing = [{ label: "", email: "keep@x.com" }];
    const before = existing.length;
    mergeEmails(existing, [{ email: "new@x.com" }]);
    expect(existing).toHaveLength(before); // input array unchanged
  });
});

describe("mergeSocials", () => {
  it("appends + dedupes by (kind, value)", () => {
    const out = mergeSocials(
      [{ kind: "linkedin", value: "linkedin.com/in/me" }],
      [{ kind: "linkedin", value: "LinkedIn.com/in/me" }, { kind: "website", value: "me.com" }],
    );
    expect(out).toHaveLength(2);
  });
  it("keeps the same handle on different platforms", () => {
    const out = mergeSocials(
      [{ kind: "instagram", value: "john" }],
      [{ kind: "x", value: "john" }],
    );
    expect(out).toHaveLength(2);
  });
});

describe("parseSummary", () => {
  it("summarizes filled fields", () => {
    const s = parseSummary(
      parsed({
        first_name: "Ann",
        company: "Acme",
        emails: [{ email: "a@x.com" }, { email: "b@x.com" }],
        phones: [{ phone: "305-555-0100" }],
      }),
    );
    expect(s).toContain("name");
    expect(s).toContain("company");
    expect(s).toContain("2 emails");
    expect(s).toContain("1 phone");
  });
  it("empty parse → empty summary", () => {
    expect(parseSummary(parsed({}))).toBe("");
  });
});
