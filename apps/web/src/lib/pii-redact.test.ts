import { describe, expect, it } from "vitest";
import { redactPII, redactString } from "./pii-redact";

describe("redactString", () => {
  it("masks email addresses", () => {
    expect(redactString("hi user@example.com")).toBe("hi u**r@e*****e.com");
  });

  it("preserves the TLD when masking domains", () => {
    expect(redactString("ping@rokki.ai")).toMatch(/p\*+g@r\*+i\.ai$/);
  });

  it("masks short local-parts conservatively", () => {
    expect(redactString("a@b.co")).toBe("a*@b*.co");
  });

  it("masks IPv4 addresses", () => {
    expect(redactString("client 192.168.0.1 connected")).toBe(
      "client [redacted-ip] connected",
    );
  });

  it("masks IPv6 addresses", () => {
    expect(redactString("from 2001:db8::1 ok")).toBe("from [redacted-ip] ok");
    expect(redactString("from ::1 ok")).toBe("from [redacted-ip] ok");
  });

  it("masks US-formatted phone numbers", () => {
    expect(redactString("call (415) 555-1212 today")).toBe(
      "call [redacted-phone] today",
    );
  });

  it("masks E.164 phone numbers", () => {
    expect(redactString("number +1 415 555 1212")).toBe(
      "number [redacted-phone]",
    );
  });

  it("leaves plain prose alone", () => {
    expect(redactString("the rain in spain")).toBe("the rain in spain");
  });

  it("does not crash on empty input", () => {
    expect(redactString("")).toBe("");
  });
});

describe("redactPII (objects)", () => {
  it("redacts values whose keys match the sensitive pattern", () => {
    const out = redactPII({
      email: "u@x.com",
      phone: "555-555-5555",
      password: "hunter2",
      token: "rk_live_abcd",
      secret: "sshhh",
      address: "1 Main St",
      ssn: "111-22-3333",
      ip: "10.0.0.1",
      keep: "this stays",
    }) as Record<string, unknown>;

    expect(out.email).toBe("[redacted]");
    expect(out.phone).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.secret).toBe("[redacted]");
    expect(out.address).toBe("[redacted]");
    expect(out.ssn).toBe("[redacted]");
    expect(out.ip).toBe("[redacted]");
    expect(out.keep).toBe("this stays");
  });

  it("redacts case-insensitive variants of sensitive keys", () => {
    const out = redactPII({
      EMAIL: "u@x.com",
      Phone_Number: "1234567890",
      myToken: "abc",
    }) as Record<string, unknown>;
    expect(out.EMAIL).toBe("[redacted]");
    expect(out.Phone_Number).toBe("[redacted]");
    expect(out.myToken).toBe("[redacted]");
  });

  it("recurses into nested objects and arrays", () => {
    const out = redactPII({
      user: { id: "u1", email: "u@x.com" },
      attempts: [{ ip: "1.2.3.4" }, { ip: "5.6.7.8" }],
    }) as { user: { email: string }; attempts: Array<{ ip: string }> };
    expect(out.user.email).toBe("[redacted]");
    expect(out.attempts[0]!.ip).toBe("[redacted]");
    expect(out.attempts[1]!.ip).toBe("[redacted]");
  });

  it("masks PII inside free-form string values", () => {
    const out = redactPII({
      message: "user u@x.com hit /api from 192.168.1.1",
    }) as { message: string };
    expect(out.message).toMatch(/u\*+@.*\.com/);
    expect(out.message).toContain("[redacted-ip]");
  });

  it("exempts allowlisted keys", () => {
    const out = redactPII(
      { email: "u@x.com", token: "abc" },
      ["email"],
    ) as Record<string, unknown>;
    expect(out.email).toBe("u@x.com");
    expect(out.token).toBe("[redacted]");
  });

  it("handles null / undefined / primitives at the root", () => {
    expect(redactPII(null)).toBeNull();
    expect(redactPII(undefined)).toBeUndefined();
    expect(redactPII(42)).toBe(42);
    expect(redactPII("hello")).toBe("hello");
  });

  it("masks an inline email in a top-level string", () => {
    expect(redactPII("hit by u@x.com")).toMatch(/u\*+@.*\.com/);
  });

  it("preserves the shape (keys are not removed)", () => {
    const out = redactPII({
      email: "u@x.com",
      nested: { phone: "555-555-5555", keep: 1 },
    }) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["email", "nested"]);
    expect(Object.keys(out.nested as object)).toEqual(["phone", "keep"]);
  });
});
