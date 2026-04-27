# @rokki/sdk

Official TypeScript SDK for the [Rokki API](https://rokki.ai). One method per OpenAPI operation, no thrown exceptions for normal API errors, works in browsers, Node 18+, Bun, Deno, and Workers.

## Install

```sh
pnpm add @rokki/sdk
# or
npm install @rokki/sdk
```

## Quickstart

```ts
import { createRokkiClient } from "@rokki/sdk";

const client = createRokkiClient({
  baseUrl: "https://rokki.ai",
  apiKey: "rk_live_…", // create one at /me/tokens
});

const { data: tasks } = await client.tasks.list({ terminalTicker: "BRKL" });
console.log(tasks);
```

## Auth modes

- **Programmatic (CLI / SDK / MCP):** pass `apiKey: "rk_live_…"`. The SDK attaches `Authorization: Bearer <key>` to every request.
- **Browser:** omit `apiKey`. The SDK calls `fetch` with `credentials: "include"` so the Supabase session cookie travels along.

## Result handling

Every method returns `Promise<{ data } | { errors }>`. Network failures, parse errors, and HTTP 4xx/5xx all collapse into the `errors` branch — you never have to wrap calls in `try/catch` for normal flow.

```ts
import { createRokkiClient, isOk } from "@rokki/sdk";

const client = createRokkiClient({ baseUrl: "https://rokki.ai", apiKey: "rk_live_…" });

const result = await client.tasks.create({
  terminalTicker: "BRKL",
  title: "Wire smoke detectors",
  due_date: "2026-05-01T00:00:00Z",
});

if (isOk(result)) {
  console.log("Created", result.data.id);
} else {
  for (const err of result.errors) console.error(err.code, err.message);
}
```

## Resources

| Resource         | Methods |
|------------------|---------|
| `health`         | `check` |
| `me`             | `get`, `update`, `listTokens`, `createToken`, `revokeToken`, `listApiKeys`, `setApiKey`, `deleteApiKey` |
| `spaces`         | `list`, `create`, `get`, `update`, `listMembers`, `addMember`, `setMemberRole`, `removeMember` |
| `terminals`      | `list`, `create`, `get`, `update`, `archive` |
| `tasks`          | `list`, `create`, `get`, `getBySeq`, `update`, `delete`, `complete`, `addAssignee`, `removeAssignee`, `listComments`, `addComment` |
| `files`          | `list`, `upload`, `update`, `delete`, `duplicate`, `restore`, `permanentDelete`, `signedUrl` |
| `folders`        | `list`, `create`, `update`, `delete`, `duplicate` |
| `tools`          | `list`, `create`, `get`, `update`, `delete`, `invoke` |
| `comments`       | `list`, `create`, `update`, `delete` |
| `approvals`      | `list`, `decide` |
| `notifications`  | `list`, `markRead` |
| `briefing`       | `get` |
| `search`         | `query` |

The full surface — including admin-only routes, calendar OAuth, drawings, share links, and message threads — is documented in the [OpenAPI spec](https://rokki.ai/api/openapi.json) and rendered at <https://rokki.ai/api/docs>. The SDK currently exposes the most commonly used routes; the rest can be reached via the underlying HTTP client.

## Tool invocation

```ts
const result = await client.tools.invoke("aerial-reels", {
  input: { address: "1662 Lincoln Ct, Miami Beach FL" },
});

if ("errors" in result) {
  // network or auth failure
} else if ("status" in result.data && result.data.status === "approval_required") {
  console.log("Waiting on approval", result.data.approval_id);
} else {
  console.log(result.data.output);
}
```

## Custom fetch

Pass a custom fetch implementation if you need request signing, retries, or are testing in an environment without `globalThis.fetch`:

```ts
const client = createRokkiClient({
  baseUrl: "https://rokki.ai",
  apiKey: "rk_live_…",
  fetch: myFetch,
  timeoutMs: 60_000,
});
```

## Versioning

The SDK is versioned independently from the server. Both follow semver. Breaking changes to the SDK API surface ship as major bumps (`1.0.0` → `2.0.0`); the `baseUrl` always speaks `/api/v1`.

## License

See [LICENSE](../../LICENSE).
