// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ContactListItem } from "../lib/client-api";

// Hoisted so the vi.mock factory (hoisted above imports) can use it.
const { items } = vi.hoisted(() => ({
  items: [
    {
      id: "c1",
      first_name: "Bob",
      last_name: "Jones",
      nickname: null,
      avatar_url: null,
      contact_types: ["broker"],
      tags: [],
      firm: "Realty Co",
      title: null,
      primary_email: "bob@x.com",
      primary_phone: null,
      status: "active",
      strength: 0,
      user_id: null,
      updated_at: "2026-06-24T00:00:00Z",
    },
  ],
}));

vi.mock("../lib/client-api", () => ({
  listContacts: vi.fn().mockResolvedValue(items),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
}));

import { ContactsView } from "./ContactsView";

const seed = items as ContactListItem[];

afterEach(cleanup);

describe("ContactsView", () => {
  it("renders the contacts list", async () => {
    render(<ContactsView initialContacts={seed} />);
    expect(await screen.findByText("Bob Jones")).toBeTruthy();
    expect(screen.getByText("Realty Co")).toBeTruthy();
  });

  it("opens the New contact form", async () => {
    render(<ContactsView initialContacts={seed} />);
    fireEvent.click(screen.getByRole("button", { name: /New/i }));
    expect(await screen.findByText("First name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("shows an empty state with no contacts", () => {
    render(<ContactsView initialContacts={[]} />);
    expect(screen.getByText(/No contacts yet/i)).toBeTruthy();
  });
});
