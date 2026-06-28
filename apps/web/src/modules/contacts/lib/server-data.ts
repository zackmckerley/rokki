/**
 * Server-side initial-data loader for the Contacts module page (SSR), mirroring
 * lib/markets/server-data. Returns the lean list rows the table needs.
 */
import { listContacts } from "@/lib/contacts/queries";
import type { ContactListItem } from "./client-api";

export async function loadContacts(
  client: unknown,
  ownerId: string,
): Promise<ContactListItem[]> {
  return (await listContacts(client, ownerId, {
    limit: 200,
  })) as ContactListItem[];
}
