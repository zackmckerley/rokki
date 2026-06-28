// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ContactRow } from "@/lib/contacts/db";
import { ContactForm } from "./ContactForm";

vi.mock("../lib/client-api", () => ({ uploadAvatar: vi.fn() }));

afterEach(cleanup);

function renderForm(initial: Partial<ContactRow>, submitLabel = "Save") {
  const onSubmit = vi.fn();
  render(
    <ContactForm
      initial={initial}
      submitLabel={submitLabel}
      onCancel={() => {}}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("ContactForm submit mapping", () => {
  it("preserves a non-first primary email flag (a no-op edit is lossless)", () => {
    const onSubmit = renderForm({
      first_name: "Meg",
      last_name: "W",
      emails: [
        { email: "a@x.com", primary: false },
        { email: "b@x.com", primary: true },
      ],
      phones: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].emails).toEqual([
      { email: "a@x.com", label: undefined, primary: false },
      { email: "b@x.com", label: undefined, primary: true },
    ]);
  });

  it("defaults the first non-empty email to primary and drops blank rows", () => {
    const onSubmit = renderForm(
      {
        first_name: "New",
        last_name: "Person",
        emails: [{ email: "first@x.com" }, { email: "" }],
        phones: [],
      },
      "Create",
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit.mock.calls[0][0].emails).toEqual([
      { email: "first@x.com", label: undefined, primary: true },
    ]);
  });

  it("keeps multiple values and trims family relations", () => {
    const onSubmit = renderForm({
      first_name: "Multi",
      emails: [{ email: "x@y.com" }],
      phones: [
        { phone: "305-1", primary: false },
        { phone: "305-2", primary: true },
      ],
      family: [{ name: " Jane ", relation: " spouse " }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const patch = onSubmit.mock.calls[0][0];
    expect(patch.phones).toEqual([
      { phone: "305-1", label: undefined, primary: false },
      { phone: "305-2", label: undefined, primary: true },
    ]);
    expect(patch.family).toEqual([{ name: "Jane", relation: "spouse" }]);
  });
});
