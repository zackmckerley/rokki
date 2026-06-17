/**
 * OpenAPI 3.1 document for the Rokki public API.
 *
 * NOTE: This spec is generated from the route handlers under
 * `apps/web/src/app/api/v1/**`. Don't edit it by hand — instead:
 *  - Add or change a handler in `app/api/v1/...`
 *  - Update the matching entry below (or add a new one) so the spec matches
 *    the actual request/response shape.
 *
 * Coverage philosophy: every route discovered by `scripts/scan-routes.cjs`
 * has at least one entry. Major resources (Task, File, Folder, Terminal,
 * Tool, Comment, Approval, ApiKey, Notification) have full schemas. Less
 * important admin / OAuth callback / one-off routes carry a stub
 * description and a generic 200 response — these are flagged as TODO so
 * we can flesh them out later without losing the surface map.
 */
import packageJson from "../../package.json";

type AnyRecord = Record<string, unknown>;

const VERSION = (packageJson as { version?: string }).version || "0.0.0";

// ---------------------------------------------------------------------------
// Reusable components
// ---------------------------------------------------------------------------

const securitySchemes = {
  cookieAuth: {
    type: "apiKey",
    in: "cookie",
    name: "sb-access-token",
    description:
      "Session cookie set by Supabase Auth on successful sign-in (`sb-access-token`). Used by the web UI and any browser caller.",
  },
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "rk_live_*** / rk_test_***",
    description:
      "Personal access token issued via `POST /v1/me/tokens`. Use the `Authorization: Bearer rk_live_...` header for programmatic clients (CLI, SDK, MCP).",
  },
} as const;

const errorEnvelope = {
  type: "object",
  required: ["errors"],
  properties: {
    errors: {
      type: "array",
      items: { $ref: "#/components/schemas/Error" },
    },
    request_id: {
      type: "string",
      description: "Matches the X-Request-Id response header for log correlation.",
      nullable: true,
    },
  },
} as const;

const errorObject = {
  type: "object",
  required: ["code", "message"],
  properties: {
    code: {
      type: "string",
      enum: [
        "invalid_request",
        "unauthenticated",
        "forbidden",
        "quota_exceeded",
        "approval_required",
        "not_found",
        "conflict",
        "payload_too_large",
        "unprocessable",
        "rate_limited",
        "internal_error",
        "upstream_error",
        "maintenance",
        "tool_disabled",
        "tool_pending",
        "approval_failed",
      ],
      description: "Machine-readable error code (see docs/02_API.md §2.2).",
    },
    message: { type: "string" },
    details: { type: "object", additionalProperties: true, nullable: true },
    retry_after_seconds: { type: "integer", nullable: true },
  },
} as const;

const taskStatusEnum = ["todo", "in_progress", "blocked", "review", "done", "cancelled"] as const;
const projectStatusEnum = ["planning", "active", "on_hold", "complete", "archived"] as const;

const schemas = {
  Error: errorObject,
  ErrorResponse: errorEnvelope,

  Task: {
    type: "object",
    required: ["id", "terminal_id", "title", "status"],
    properties: {
      id: { type: "string", format: "uuid" },
      terminal_id: { type: "string", format: "uuid" },
      ticker_seq: { type: "integer", description: "Sequential per-terminal task number (BRKL-12)." },
      title: { type: "string", maxLength: 300 },
      description: { type: "string", nullable: true },
      status: { type: "string", enum: taskStatusEnum },
      priority: { type: "integer", minimum: 1, maximum: 4 },
      due_date: { type: "string", format: "date-time", nullable: true },
      labels: { type: "array", items: { type: "string" } },
      metadata: { type: "object", additionalProperties: true },
      recurrence_rule: { type: "object", additionalProperties: true, nullable: true },
      recurrence_parent_id: { type: "string", format: "uuid", nullable: true },
      created_at: { type: "string", format: "date-time" },
      created_by: { type: "string", format: "uuid", nullable: true },
      updated_at: { type: "string", format: "date-time" },
      completed_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  TaskCreate: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 300 },
      description: { type: "string", nullable: true },
      priority: { type: "integer", minimum: 1, maximum: 4, default: 3 },
      due_date: { type: "string", format: "date-time", nullable: true },
      labels: { type: "array", items: { type: "string" } },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Alias for `labels`. Server maps either name to the same column.",
      },
      status: { type: "string", enum: taskStatusEnum, default: "todo" },
      recurrence_rule: { type: "object", additionalProperties: true, nullable: true },
    },
  },

  TaskPatch: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 300 },
      description: { type: "string", nullable: true },
      status: { type: "string", enum: taskStatusEnum },
      priority: { type: "integer", minimum: 1, maximum: 4 },
      due_date: { type: "string", format: "date-time", nullable: true },
      labels: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      recurrence_rule: { type: "object", additionalProperties: true, nullable: true },
    },
  },

  Terminal: {
    type: "object",
    required: ["id", "space_id", "ticker", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      space_id: { type: "string", format: "uuid" },
      ticker: { type: "string", description: "2–10 uppercase letters/digits, starts with letter." },
      name: { type: "string", maxLength: 200 },
      description: { type: "string", nullable: true },
      type: { type: "string", description: "Free-form vertical/category tag (e.g. construction, legal)." },
      status: { type: "string", enum: projectStatusEnum },
      metadata: { type: "object", additionalProperties: true },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },

  TerminalCreate: {
    type: "object",
    required: ["space_id", "name"],
    properties: {
      space_id: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 200 },
      ticker: {
        type: "string",
        description: "Optional. If omitted, server suggests one from the name and de-dupes within the space.",
      },
      description: { type: "string", nullable: true },
      type: { type: "string", default: "space" },
      status: { type: "string", enum: projectStatusEnum, default: "planning" },
      metadata: { type: "object", additionalProperties: true },
    },
  },

  Space: {
    type: "object",
    required: ["id", "slug", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      slug: { type: "string", description: "Lowercase, 3–40 chars, starts with letter." },
      name: { type: "string", maxLength: 120 },
      created_at: { type: "string", format: "date-time" },
    },
  },

  SpaceMembership: {
    type: "object",
    properties: {
      role: { type: "string", enum: ["owner", "admin", "member"] },
      spaces: { $ref: "#/components/schemas/Space" },
    },
  },

  File: {
    type: "object",
    required: ["id", "terminal_id", "filename"],
    properties: {
      id: { type: "string", format: "uuid" },
      terminal_id: { type: "string", format: "uuid" },
      filename: { type: "string", maxLength: 300 },
      folder: { type: "string", description: "Folder path beginning with `/`." },
      visibility: { type: "string", enum: ["project", "owners", "custom"] },
      visibility_roles: {
        type: "array",
        items: {
          type: "string",
          enum: ["owner", "manager", "architect", "gc", "lender", "family", "guest"],
        },
      },
      visibility_users: { type: "array", items: { type: "string", format: "uuid" } },
      size_bytes: { type: "integer", nullable: true },
      mime_type: { type: "string", nullable: true },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
      deleted_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  FilePatch: {
    type: "object",
    properties: {
      filename: { type: "string", minLength: 1, maxLength: 300 },
      folder: { type: "string", pattern: "^/" },
      visibility: { type: "string", enum: ["project", "owners", "custom"] },
      visibility_roles: {
        type: "array",
        items: {
          type: "string",
          enum: ["owner", "manager", "architect", "gc", "lender", "family", "guest"],
        },
      },
      visibility_users: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },

  Folder: {
    type: "object",
    required: ["id", "terminal_id", "path"],
    properties: {
      id: { type: "string", format: "uuid" },
      terminal_id: { type: "string", format: "uuid" },
      path: { type: "string", description: "Always starts with `/`." },
      name: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      deleted_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  Tool: {
    type: "object",
    required: ["id", "slug", "name", "current_version"],
    properties: {
      id: { type: "string", format: "uuid" },
      slug: { type: "string" },
      name: { type: "string", maxLength: 120 },
      description: { type: "string" },
      visibility: { type: "string", enum: ["public", "space", "private"] },
      owner_user_id: { type: "string", format: "uuid", nullable: true },
      owner_space_id: { type: "string", format: "uuid", nullable: true },
      current_version: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      timeout_seconds: { type: "integer", minimum: 1, maximum: 30 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },

  ToolCreate: {
    type: "object",
    required: ["name", "description", "code"],
    properties: {
      name: { type: "string", maxLength: 120 },
      slug: { type: "string", description: "Auto-derived from name if omitted." },
      description: { type: "string", minLength: 10, maxLength: 2000 },
      input_schema: { type: "object", additionalProperties: true },
      output_schema: { type: "object", additionalProperties: true, nullable: true },
      code: { type: "string", description: "Source code for index.js." },
      timeout_seconds: { type: "integer", minimum: 1, maximum: 30, default: 10 },
      tags: { type: "array", items: { type: "string" } },
    },
  },

  ToolInvokeRequest: {
    type: "object",
    properties: {
      input: { description: "Arbitrary JSON forwarded to the tool runtime." },
      scripts: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Owner-only override for testing draft code without bumping a version.",
      },
      entrypoint: { type: "string", default: "index.js" },
    },
  },

  ToolInvokeResult: {
    type: "object",
    required: ["status", "duration_ms", "logs"],
    properties: {
      status: { type: "string", enum: ["success", "error", "timeout"] },
      output: { description: "Tool's JSON output." },
      logs: { type: "array", items: { type: "string" } },
      duration_ms: { type: "integer" },
      error_message: { type: "string", nullable: true },
      error_code: { type: "string", nullable: true },
    },
  },

  Comment: {
    type: "object",
    required: ["id", "body"],
    properties: {
      id: { type: "string", format: "uuid" },
      target_type: { type: "string", enum: ["task", "file", "terminal"] },
      target_id: { type: "string", format: "uuid" },
      author_id: { type: "string", format: "uuid" },
      body: { type: "string" },
      mentions: { type: "array", items: { type: "string", format: "uuid" } },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
      deleted_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  Approval: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      type: { type: "string", enum: ["tool_access", "tool_invocation"] },
      requester_id: { type: "string", format: "uuid" },
      approver_space_id: { type: "string", format: "uuid" },
      subject_type: { type: "string" },
      subject_id: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["pending", "approved", "denied", "cancelled"] },
      context: { type: "object", additionalProperties: true },
      created_at: { type: "string", format: "date-time" },
      decided_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  ApiKey: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      provider: {
        type: "string",
        description: "BYOK provider name (e.g. anthropic, openai).",
      },
      created_at: { type: "string", format: "date-time" },
      last_used_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  AccessToken: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      scopes: { type: "array", items: { type: "string" } },
      created_at: { type: "string", format: "date-time" },
      last_used_at: { type: "string", format: "date-time", nullable: true },
      expires_at: { type: "string", format: "date-time", nullable: true },
      revoked_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  Notification: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      kind: { type: "string" },
      title: { type: "string" },
      body: { type: "string", nullable: true },
      target_type: { type: "string", nullable: true },
      target_id: { type: "string", format: "uuid", nullable: true },
      read_at: { type: "string", format: "date-time", nullable: true },
      created_at: { type: "string", format: "date-time" },
    },
  },

  Profile: {
    type: "object",
    properties: {
      user_id: { type: "string", format: "uuid" },
      email: { type: "string", format: "email" },
      full_name: { type: "string", nullable: true },
      avatar_url: { type: "string", format: "uri", nullable: true },
      timezone: { type: "string", nullable: true },
      settings: { type: "object", additionalProperties: true },
      preferences: { type: "object", additionalProperties: true },
      is_platform_admin: { type: "boolean" },
      created_at: { type: "string", format: "date-time" },
    },
  },

  HealthResponse: {
    type: "object",
    required: ["status", "version", "time", "checks"],
    properties: {
      status: { type: "string", enum: ["ok", "degraded"] },
      version: { type: "string" },
      time: { type: "string", format: "date-time" },
      checks: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            error: { type: "string", nullable: true },
          },
        },
      },
    },
  },

  EmptyObject: { type: "object", additionalProperties: false },

  // -- Markets ------------------------------------------------------------
  // Normalized, provider-agnostic shapes (see lib/markets/providers/types.ts)
  // plus the persisted mkt_* rows (see lib/markets/db.ts). Markets responses
  // use the standard `{ data: { … } }` envelope but with named inner keys
  // (e.g. `{ data: { quote, cached } }`), so the path entries below wrap
  // these schemas in inline objects rather than `dataResp(ref(...))`.

  MktQuote: {
    type: "object",
    required: ["symbol", "price", "change", "changePct", "currency", "marketState", "asOf", "provider"],
    properties: {
      symbol: { type: "string" },
      name: { type: "string" },
      price: { type: "number" },
      change: { type: "number" },
      changePct: { type: "number" },
      open: { type: "number", nullable: true },
      high: { type: "number", nullable: true },
      low: { type: "number", nullable: true },
      prevClose: { type: "number", nullable: true },
      volume: { type: "number", nullable: true },
      marketCap: { type: "number", nullable: true },
      peRatio: { type: "number", nullable: true },
      week52High: { type: "number", nullable: true },
      week52Low: { type: "number", nullable: true },
      currency: { type: "string" },
      exchange: { type: "string", nullable: true },
      marketState: { type: "string", enum: ["pre", "open", "post", "closed", "unknown"] },
      asOf: { type: "string", format: "date-time", description: "ISO timestamp the quote was sourced." },
      provider: { type: "string" },
    },
  },

  MktSymbolMatch: {
    type: "object",
    required: ["symbol", "name", "type"],
    properties: {
      symbol: { type: "string" },
      name: { type: "string" },
      exchange: { type: "string", nullable: true },
      type: { type: "string", description: "Instrument type (stock, etf, crypto, fx, index, …)." },
    },
  },

  MktCompanyProfile: {
    type: "object",
    required: ["symbol", "name", "currency", "provider"],
    properties: {
      symbol: { type: "string" },
      name: { type: "string" },
      exchange: { type: "string", nullable: true },
      industry: { type: "string", nullable: true },
      sector: { type: "string", nullable: true },
      country: { type: "string", nullable: true },
      currency: { type: "string" },
      marketCap: { type: "number", nullable: true },
      sharesOutstanding: { type: "number", nullable: true },
      logo: { type: "string", nullable: true },
      weburl: { type: "string", nullable: true },
      ipo: { type: "string", nullable: true },
      description: { type: "string", nullable: true },
      beta: { type: "number", nullable: true },
      dividendYield: { type: "number", nullable: true },
      provider: { type: "string" },
    },
  },

  MktCandle: {
    type: "object",
    required: ["time", "open", "high", "low", "close", "volume"],
    properties: {
      time: { type: "integer", description: "Unix seconds." },
      open: { type: "number" },
      high: { type: "number" },
      low: { type: "number" },
      close: { type: "number" },
      volume: { type: "number" },
    },
  },

  MktNewsItem: {
    type: "object",
    required: ["id", "headline", "source", "url", "datetime", "symbols"],
    properties: {
      id: { type: "string" },
      headline: { type: "string" },
      summary: { type: "string", nullable: true },
      source: { type: "string" },
      url: { type: "string" },
      imageUrl: { type: "string", nullable: true },
      datetime: { type: "string", format: "date-time" },
      symbols: { type: "array", items: { type: "string" } },
    },
  },

  MktFinancialReport: {
    type: "object",
    required: ["symbol", "statement", "currency", "periods", "provider"],
    properties: {
      symbol: { type: "string" },
      statement: { type: "string", enum: ["income", "balance", "cash"] },
      currency: { type: "string" },
      periods: {
        type: "array",
        items: {
          type: "object",
          required: ["fiscalDate", "period", "lineItems"],
          properties: {
            fiscalDate: { type: "string", format: "date", description: "Fiscal period end." },
            period: { type: "string", enum: ["Q", "FY"] },
            lineItems: { type: "object", additionalProperties: { type: "number", nullable: true } },
          },
        },
      },
      provider: { type: "string" },
    },
  },

  MktEarningsEvent: {
    type: "object",
    required: ["symbol", "date"],
    properties: {
      symbol: { type: "string" },
      date: { type: "string", format: "date" },
      hour: { type: "string", enum: ["bmo", "amc", "dmh"], nullable: true },
      epsEstimate: { type: "number", nullable: true },
      epsActual: { type: "number", nullable: true },
      revenueEstimate: { type: "number", nullable: true },
      revenueActual: { type: "number", nullable: true },
    },
  },

  MktMover: {
    type: "object",
    required: ["symbol", "price", "change", "changePct"],
    properties: {
      symbol: { type: "string" },
      name: { type: "string", nullable: true },
      price: { type: "number" },
      change: { type: "number" },
      changePct: { type: "number" },
      volume: { type: "number", nullable: true },
    },
  },

  MktOverviewRow: {
    type: "object",
    required: ["symbol", "label", "price", "change", "changePct"],
    properties: {
      symbol: { type: "string" },
      label: { type: "string" },
      price: { type: "number" },
      change: { type: "number" },
      changePct: { type: "number" },
    },
  },

  MktWatchlistSymbol: {
    type: "object",
    required: ["id", "watchlist_id", "symbol", "display_order", "added_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      watchlist_id: { type: "string", format: "uuid" },
      symbol: { type: "string" },
      display_order: { type: "integer" },
      note: { type: "string", nullable: true },
      added_at: { type: "string", format: "date-time" },
    },
  },

  MktWatchlist: {
    type: "object",
    required: ["id", "name", "display_order", "created_by", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid", nullable: true },
      space_id: { type: "string", format: "uuid", nullable: true },
      terminal_id: { type: "string", format: "uuid", nullable: true },
      name: { type: "string", maxLength: 120 },
      display_order: { type: "integer" },
      created_by: { type: "string", format: "uuid" },
      created_at: { type: "string", format: "date-time" },
      archived_at: { type: "string", format: "date-time", nullable: true },
      symbols: {
        type: "array",
        items: { $ref: "#/components/schemas/MktWatchlistSymbol" },
        description: "Present on list/read; ordered by display_order.",
      },
    },
  },

  MktWatchlistCreate: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      scope: { type: "string", enum: ["user", "space", "terminal"], default: "user" },
      scopeId: { type: "string", description: "Required when scope is space or terminal (the space/terminal id)." },
    },
  },

  MktWatchlistPatch: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      display_order: { type: "integer" },
    },
  },

  MktWatchlistSymbolCreate: {
    type: "object",
    required: ["symbol"],
    properties: {
      symbol: { type: "string" },
      note: { type: "string", nullable: true, maxLength: 280 },
    },
  },

  MktPortfolio: {
    type: "object",
    required: ["id", "name", "base_currency", "created_by", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid", nullable: true },
      space_id: { type: "string", format: "uuid", nullable: true },
      terminal_id: { type: "string", format: "uuid", nullable: true },
      name: { type: "string", maxLength: 120 },
      base_currency: { type: "string", description: "ISO 4217, 3 letters." },
      created_by: { type: "string", format: "uuid" },
      created_at: { type: "string", format: "date-time" },
      archived_at: { type: "string", format: "date-time", nullable: true },
    },
  },

  MktPortfolioCreate: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      baseCurrency: { type: "string", default: "USD" },
      scope: { type: "string", enum: ["user", "space", "terminal"], default: "user" },
      scopeId: { type: "string", description: "Required when scope is space or terminal." },
    },
  },

  MktPortfolioPatch: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      baseCurrency: { type: "string" },
    },
  },

  MktLot: {
    type: "object",
    required: ["id", "portfolio_id", "symbol", "side", "quantity", "price", "fees", "trade_date", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      portfolio_id: { type: "string", format: "uuid" },
      symbol: { type: "string" },
      side: { type: "string", enum: ["buy", "sell"] },
      quantity: { type: "number" },
      price: { type: "number" },
      fees: { type: "number" },
      trade_date: { type: "string", format: "date" },
      note: { type: "string", nullable: true },
      created_at: { type: "string", format: "date-time" },
    },
  },

  MktLotCreate: {
    type: "object",
    required: ["symbol", "side", "quantity", "price"],
    properties: {
      symbol: { type: "string" },
      side: { type: "string", enum: ["buy", "sell"] },
      quantity: { type: "number", exclusiveMinimum: 0 },
      price: { type: "number", minimum: 0 },
      fees: { type: "number", minimum: 0, default: 0 },
      tradeDate: { type: "string", format: "date", description: "Defaults to today (UTC) if omitted." },
      note: { type: "string", nullable: true, maxLength: 280 },
    },
  },

  MktPositionPerformance: {
    type: "object",
    required: ["symbol", "quantity", "avgCost", "costBasis", "realizedPL"],
    properties: {
      symbol: { type: "string" },
      quantity: { type: "number" },
      avgCost: { type: "number" },
      costBasis: { type: "number" },
      realizedPL: { type: "number" },
      price: { type: "number", nullable: true },
      marketValue: { type: "number", nullable: true },
      unrealizedPL: { type: "number", nullable: true },
      unrealizedPct: { type: "number", nullable: true },
      dayChange: { type: "number", nullable: true },
      weight: { type: "number", nullable: true },
    },
  },

  MktPortfolioPerformance: {
    type: "object",
    required: [
      "positions",
      "totalMarketValue",
      "totalCostBasis",
      "totalUnrealizedPL",
      "totalRealizedPL",
      "totalDayChange",
      "unrealizedPct",
    ],
    properties: {
      positions: { type: "array", items: { $ref: "#/components/schemas/MktPositionPerformance" } },
      totalMarketValue: { type: "number" },
      totalCostBasis: { type: "number" },
      totalUnrealizedPL: { type: "number" },
      totalRealizedPL: { type: "number" },
      totalDayChange: { type: "number" },
      unrealizedPct: { type: "number" },
    },
  },

  MktAlert: {
    type: "object",
    required: ["id", "user_id", "symbol", "condition", "threshold", "active", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      symbol: { type: "string" },
      condition: { type: "string", enum: ["price_above", "price_below", "pct_up", "pct_down"] },
      threshold: { type: "number" },
      active: { type: "boolean" },
      note: { type: "string", nullable: true },
      last_triggered_at: { type: "string", format: "date-time", nullable: true },
      created_at: { type: "string", format: "date-time" },
    },
  },

  MktAlertCreate: {
    type: "object",
    required: ["symbol", "condition", "threshold"],
    properties: {
      symbol: { type: "string" },
      condition: { type: "string", enum: ["price_above", "price_below", "pct_up", "pct_down"] },
      threshold: { type: "number" },
      note: { type: "string", nullable: true, maxLength: 280 },
    },
  },

  MktAlertPatch: {
    type: "object",
    properties: {
      active: { type: "boolean" },
      threshold: { type: "number" },
      note: { type: "string", nullable: true, maxLength: 280 },
    },
  },

  MktScreenerRequest: {
    type: "object",
    properties: {
      universe: {
        type: "array",
        items: { type: "string" },
        description: "Optional symbol universe (max 100). Defaults to the built-in screener universe.",
      },
      filters: {
        type: "object",
        properties: {
          minPrice: { type: "number" },
          maxPrice: { type: "number" },
          minChangePct: { type: "number" },
          maxChangePct: { type: "number" },
          minMarketCap: { type: "number" },
          maxMarketCap: { type: "number" },
        },
      },
      sort: { type: "string", enum: ["changePct", "price", "marketCap"], default: "changePct" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const PATH_PARAM_RE = /\{([^}]+)\}/g;

function paramsFor(path: string, extra: Record<string, AnyRecord> = {}): AnyRecord[] {
  const out: AnyRecord[] = [];
  for (const m of path.matchAll(PATH_PARAM_RE)) {
    const name = m[1]!;
    const override = extra[name];
    out.push(
      override ?? {
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    );
  }
  return out;
}

function dataResp(refOrSchema: AnyRecord, status = 200): AnyRecord {
  return {
    [String(status)]: {
      description: status === 201 ? "Created" : "OK",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { data: refOrSchema },
            required: ["data"],
          },
        },
      },
    },
  };
}

function listResp(itemRef: AnyRecord, status = 200): AnyRecord {
  return dataResp({ type: "array", items: itemRef }, status);
}

const errorResponses = {
  "400": {
    description: "Invalid request",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  },
  "401": {
    description: "Unauthenticated",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  },
  "403": {
    description: "Forbidden",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  },
  "404": {
    description: "Not found",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  },
  "500": {
    description: "Internal error",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  },
} as const;

const noContent = {
  "204": { description: "No content" },
} as const;

function op(o: AnyRecord): AnyRecord {
  return {
    ...o,
    responses: { ...(o.responses as AnyRecord), ...errorResponses },
  };
}

function todoStub(method: string, summary: string): AnyRecord {
  return op({
    summary,
    description: `TODO: complete this. Auto-generated stub from route handler discovery for ${method}.`,
    responses: {
      "200": {
        description: "Success",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { data: {} },
            },
          },
        },
      },
    },
  });
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

// ---------------------------------------------------------------------------
// Path definitions
// ---------------------------------------------------------------------------

const paths: Record<string, AnyRecord> = {
  // -- Health -------------------------------------------------------------
  "/v1/health": {
    get: op({
      tags: ["health"],
      summary: "Service health probe",
      security: [],
      responses: dataResp(ref("HealthResponse")),
    }),
  },

  // -- Me / profile -------------------------------------------------------
  "/v1/me": {
    get: op({
      tags: ["me"],
      summary: "Get my profile",
      responses: dataResp(ref("Profile")),
    }),
    patch: op({
      tags: ["me"],
      summary: "Update my profile",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                full_name: { type: "string", maxLength: 120 },
                avatar_url: { type: "string", nullable: true },
                timezone: { type: "string", nullable: true },
                preferences: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
      responses: noContent,
    }),
  },
  "/v1/me/announcements": { get: todoStub("GET", "List active announcements for me") },
  "/v1/me/announcements/{id}/dismiss": {
    post: op({
      tags: ["me"],
      summary: "Dismiss an announcement",
      parameters: paramsFor("/v1/me/announcements/{id}/dismiss"),
      responses: noContent,
    }),
  },
  "/v1/me/api-keys": {
    get: op({
      tags: ["me"],
      summary: "List my BYOK provider keys",
      responses: listResp(ref("ApiKey")),
    }),
    post: op({
      tags: ["me"],
      summary: "Add or replace a BYOK provider key",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["provider", "key"],
              properties: {
                provider: { type: "string" },
                key: { type: "string" },
              },
            },
          },
        },
      },
      responses: dataResp(ref("ApiKey"), 201),
    }),
  },
  "/v1/me/api-keys/{id}": {
    delete: op({
      tags: ["me"],
      summary: "Delete a BYOK provider key",
      parameters: paramsFor("/v1/me/api-keys/{id}"),
      responses: noContent,
    }),
  },
  "/v1/me/flags": { get: todoStub("GET", "Feature flags resolved for me") },
  "/v1/me/push-subscriptions": {
    get: todoStub("GET", "List my push subscriptions"),
    post: todoStub("POST", "Register a push subscription"),
    delete: todoStub("DELETE", "Unregister a push subscription"),
  },
  "/v1/me/tokens": {
    get: op({
      tags: ["me"],
      summary: "List my personal access tokens",
      responses: listResp(ref("AccessToken")),
    }),
    post: op({
      tags: ["me"],
      summary: "Create a personal access token",
      description:
        "Returns the plaintext token in the response — store it now, the server only keeps the hash.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                scopes: { type: "array", items: { type: "string" } },
                expires_at: { type: "string", format: "date-time", nullable: true },
              },
            },
          },
        },
      },
      responses: dataResp(
        {
          allOf: [
            ref("AccessToken"),
            {
              type: "object",
              properties: { token: { type: "string", description: "Plaintext rk_live_… token" } },
            },
          ],
        },
        201,
      ),
    }),
  },
  "/v1/me/tokens/{id}": {
    delete: op({
      tags: ["me"],
      summary: "Revoke a personal access token",
      parameters: paramsFor("/v1/me/tokens/{id}"),
      responses: noContent,
    }),
  },

  // -- Auth ---------------------------------------------------------------
  "/v1/auth/accounts": { get: todoStub("GET", "List the accounts in the current device's account ring") },
  "/v1/auth/accounts/add": { post: todoStub("POST", "Add an account to the device's ring") },
  "/v1/auth/accounts/switch": { post: todoStub("POST", "Switch the active account for this device") },
  "/v1/auth/password-login": {
    post: op({
      tags: ["auth"],
      security: [],
      summary: "Sign in with email + password",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 8 },
              },
            },
          },
        },
      },
      responses: dataResp({
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
        },
      }),
    }),
  },
  "/v1/auth/send-link": {
    post: op({
      tags: ["auth"],
      security: [],
      summary: "Request a magic-link email",
      description: "Always returns 200 (avoid enumeration). Rate-limited to 5/min per IP.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email"],
              properties: {
                email: { type: "string", format: "email" },
                redirect_to: { type: "string" },
              },
            },
          },
        },
      },
      responses: dataResp({ type: "object", properties: { sent: { type: "boolean" } } }),
    }),
  },
  "/v1/auth/sign-out": {
    post: op({
      tags: ["auth"],
      summary: "Clear session cookie",
      responses: noContent,
    }),
  },

  // -- Spaces / orgs ------------------------------------------------------
  "/v1/orgs": {
    get: op({
      tags: ["spaces"],
      summary: "List my spaces",
      responses: listResp(ref("SpaceMembership")),
    }),
    post: op({
      tags: ["spaces"],
      summary: "Create a space (platform admins only)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["slug", "name"],
              properties: {
                slug: { type: "string", pattern: "^[a-z][a-z0-9-]{1,38}[a-z0-9]$" },
                name: { type: "string", minLength: 1, maxLength: 120 },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Space"), 201),
    }),
  },
  "/v1/orgs/{slug}": {
    get: op({
      tags: ["spaces"],
      summary: "Get a space",
      parameters: paramsFor("/v1/orgs/{slug}"),
      responses: dataResp(ref("Space")),
    }),
    patch: op({
      tags: ["spaces"],
      summary: "Update a space",
      parameters: paramsFor("/v1/orgs/{slug}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { name: { type: "string", minLength: 1, maxLength: 120 } },
            },
          },
        },
      },
      responses: dataResp(ref("Space")),
    }),
  },
  "/v1/orgs/{slug}/members": {
    get: op({
      tags: ["spaces"],
      summary: "List members of a space",
      parameters: paramsFor("/v1/orgs/{slug}/members"),
      responses: listResp({
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["owner", "admin", "member"] },
        },
      }),
    }),
    post: op({
      tags: ["spaces"],
      summary: "Invite or add a member to a space",
      parameters: paramsFor("/v1/orgs/{slug}/members"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email"],
              properties: {
                email: { type: "string", format: "email" },
                role: { type: "string", enum: ["owner", "admin", "member"], default: "member" },
              },
            },
          },
        },
      },
      responses: dataResp(ref("SpaceMembership"), 201),
    }),
  },
  "/v1/orgs/{slug}/members/{userId}": {
    patch: op({
      tags: ["spaces"],
      summary: "Change a member's role",
      parameters: paramsFor("/v1/orgs/{slug}/members/{userId}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["role"],
              properties: { role: { type: "string", enum: ["owner", "admin", "member"] } },
            },
          },
        },
      },
      responses: noContent,
    }),
    delete: op({
      tags: ["spaces"],
      summary: "Remove a member from a space",
      parameters: paramsFor("/v1/orgs/{slug}/members/{userId}"),
      responses: noContent,
    }),
  },
  "/v1/orgs/{slug}/vendors": {
    get: todoStub("GET", "List vendors for a space"),
    post: todoStub("POST", "Create a vendor for a space"),
  },

  // -- Terminals (projects) -----------------------------------------------
  "/v1/projects": {
    get: op({
      tags: ["terminals"],
      summary: "List terminals visible to me",
      responses: listResp(ref("Terminal")),
    }),
    post: op({
      tags: ["terminals"],
      summary: "Create a terminal",
      description:
        "Caller must be owner or admin of the parent space. Ticker is auto-suggested if omitted.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("TerminalCreate") } },
      },
      responses: dataResp(ref("Terminal"), 201),
    }),
  },
  "/v1/projects/{ticker}": {
    get: op({
      tags: ["terminals"],
      summary: "Get a terminal by ticker",
      parameters: paramsFor("/v1/projects/{ticker}"),
      responses: dataResp(ref("Terminal")),
    }),
    patch: op({
      tags: ["terminals"],
      summary: "Update a terminal",
      parameters: paramsFor("/v1/projects/{ticker}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string", nullable: true },
                type: { type: "string" },
                status: { type: "string", enum: projectStatusEnum },
                metadata: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Terminal")),
    }),
    delete: op({
      tags: ["terminals"],
      summary: "Archive a terminal",
      parameters: paramsFor("/v1/projects/{ticker}"),
      responses: noContent,
    }),
  },
  "/v1/projects/{ticker}/budget": {
    get: todoStub("GET", "Get budget for a terminal"),
    post: todoStub("POST", "Create a budget line item"),
  },
  "/v1/projects/{ticker}/files": {
    get: op({
      tags: ["files"],
      summary: "List files in a terminal",
      parameters: paramsFor("/v1/projects/{ticker}/files"),
      responses: listResp(ref("File")),
    }),
    post: op({
      tags: ["files"],
      summary: "Upload a file (multipart/form-data)",
      parameters: paramsFor("/v1/projects/{ticker}/files"),
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string", format: "binary" },
                folder: { type: "string", default: "/" },
                visibility: { type: "string", enum: ["project", "owners", "custom"], default: "project" },
              },
            },
          },
        },
      },
      responses: dataResp(ref("File"), 201),
    }),
  },
  "/v1/projects/{ticker}/folders": {
    get: op({
      tags: ["files"],
      summary: "List folders in a terminal",
      parameters: paramsFor("/v1/projects/{ticker}/folders"),
      responses: listResp(ref("Folder")),
    }),
    post: op({
      tags: ["files"],
      summary: "Create a folder",
      parameters: paramsFor("/v1/projects/{ticker}/folders"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["path"],
              properties: { path: { type: "string", pattern: "^/" } },
            },
          },
        },
      },
      responses: dataResp(ref("Folder"), 201),
    }),
  },
  "/v1/projects/{ticker}/members": {
    get: todoStub("GET", "List members of a terminal"),
    post: todoStub("POST", "Add a member to a terminal"),
  },
  "/v1/projects/{ticker}/members/{userId}": {
    patch: todoStub("PATCH", "Update a terminal member's role"),
    delete: todoStub("DELETE", "Remove a member from a terminal"),
  },
  "/v1/projects/{ticker}/permits": {
    get: todoStub("GET", "List permits attached to a terminal"),
    post: todoStub("POST", "Create a permit record"),
  },
  "/v1/projects/{ticker}/schedule": {
    get: todoStub("GET", "Get the schedule for a terminal"),
    post: todoStub("POST", "Add a schedule entry"),
  },
  "/v1/projects/{ticker}/tasks": {
    get: op({
      tags: ["tasks"],
      summary: "List tasks in a terminal",
      parameters: [
        ...paramsFor("/v1/projects/{ticker}/tasks"),
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: taskStatusEnum },
        },
      ],
      responses: listResp(ref("Task")),
    }),
    post: op({
      tags: ["tasks"],
      summary: "Create a task in a terminal",
      parameters: paramsFor("/v1/projects/{ticker}/tasks"),
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("TaskCreate") } },
      },
      responses: dataResp(ref("Task"), 201),
    }),
  },

  // -- Tasks --------------------------------------------------------------
  "/v1/tasks/{id}": {
    get: op({
      tags: ["tasks"],
      summary: "Get a task",
      parameters: paramsFor("/v1/tasks/{id}"),
      responses: dataResp(ref("Task")),
    }),
    patch: op({
      tags: ["tasks"],
      summary: "Update a task",
      parameters: paramsFor("/v1/tasks/{id}"),
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("TaskPatch") } },
      },
      responses: dataResp(ref("Task")),
    }),
    delete: op({
      tags: ["tasks"],
      summary: "Delete a task",
      parameters: paramsFor("/v1/tasks/{id}"),
      responses: noContent,
    }),
  },
  "/v1/tasks/by-seq/{ticker}/{seq}": {
    get: op({
      tags: ["tasks"],
      summary: "Get a task by ticker + sequence number",
      parameters: paramsFor("/v1/tasks/by-seq/{ticker}/{seq}", {
        seq: { name: "seq", in: "path", required: true, schema: { type: "integer" } },
      }),
      responses: dataResp(ref("Task")),
    }),
  },
  "/v1/tasks/{id}/complete": {
    post: op({
      tags: ["tasks"],
      summary: "Mark a task done (sets status + completed_at)",
      parameters: paramsFor("/v1/tasks/{id}/complete"),
      responses: dataResp(ref("Task")),
    }),
  },
  "/v1/tasks/{id}/assignees": {
    post: op({
      tags: ["tasks"],
      summary: "Add an assignee",
      parameters: paramsFor("/v1/tasks/{id}/assignees"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["user_id"],
              properties: { user_id: { type: "string", format: "uuid" } },
            },
          },
        },
      },
      responses: noContent,
    }),
    delete: op({
      tags: ["tasks"],
      summary: "Remove an assignee",
      parameters: [
        ...paramsFor("/v1/tasks/{id}/assignees"),
        { name: "user_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      ],
      responses: noContent,
    }),
  },
  "/v1/tasks/{id}/comments": {
    get: op({
      tags: ["tasks"],
      summary: "List comments on a task",
      parameters: paramsFor("/v1/tasks/{id}/comments"),
      responses: listResp(ref("Comment")),
    }),
    post: op({
      tags: ["tasks"],
      summary: "Comment on a task",
      parameters: paramsFor("/v1/tasks/{id}/comments"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["body"],
              properties: { body: { type: "string" } },
            },
          },
        },
      },
      responses: dataResp(ref("Comment"), 201),
    }),
  },
  "/v1/tasks/{id}/comments/{commentId}": {
    patch: op({
      tags: ["tasks"],
      summary: "Edit a task comment",
      parameters: paramsFor("/v1/tasks/{id}/comments/{commentId}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["body"], properties: { body: { type: "string" } } },
          },
        },
      },
      responses: dataResp(ref("Comment")),
    }),
    delete: op({
      tags: ["tasks"],
      summary: "Delete a task comment",
      parameters: paramsFor("/v1/tasks/{id}/comments/{commentId}"),
      responses: noContent,
    }),
  },
  "/v1/tasks/{id}/dependencies": {
    post: todoStub("POST", "Add a task dependency"),
    delete: todoStub("DELETE", "Remove a task dependency"),
  },
  "/v1/tasks/{id}/subtasks": {
    get: todoStub("GET", "List subtasks of a task"),
    post: todoStub("POST", "Create a subtask"),
  },
  "/v1/tasks/{id}/subtasks/{subtaskId}": {
    patch: todoStub("PATCH", "Update a subtask"),
    delete: todoStub("DELETE", "Delete a subtask"),
  },
  "/v1/tasks/{id}/watchers": {
    get: todoStub("GET", "List task watchers"),
    post: todoStub("POST", "Add a task watcher"),
  },
  "/v1/tasks/{id}/watchers/{userId}": {
    delete: todoStub("DELETE", "Remove a task watcher"),
  },

  // -- Comments (generic) -------------------------------------------------
  "/v1/comments": {
    get: op({
      tags: ["comments"],
      summary: "List comments by target",
      parameters: [
        { name: "target_type", in: "query", required: true, schema: { type: "string" } },
        { name: "target_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
      ],
      responses: listResp(ref("Comment")),
    }),
    post: op({
      tags: ["comments"],
      summary: "Create a comment",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["target_type", "target_id", "body"],
              properties: {
                target_type: { type: "string", enum: ["task", "file", "terminal"] },
                target_id: { type: "string", format: "uuid" },
                body: { type: "string" },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Comment"), 201),
    }),
  },
  "/v1/comments/{id}": {
    patch: op({
      tags: ["comments"],
      summary: "Edit a comment",
      parameters: paramsFor("/v1/comments/{id}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["body"], properties: { body: { type: "string" } } },
          },
        },
      },
      responses: dataResp(ref("Comment")),
    }),
    delete: op({
      tags: ["comments"],
      summary: "Delete a comment",
      parameters: paramsFor("/v1/comments/{id}"),
      responses: noContent,
    }),
  },

  // -- Files --------------------------------------------------------------
  "/v1/files/{id}": {
    patch: op({
      tags: ["files"],
      summary: "Update file metadata",
      parameters: paramsFor("/v1/files/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("FilePatch") } } },
      responses: dataResp(ref("File")),
    }),
    delete: op({
      tags: ["files"],
      summary: "Soft-delete a file",
      parameters: paramsFor("/v1/files/{id}"),
      responses: noContent,
    }),
  },
  "/v1/files/{id}/download": {
    get: op({
      tags: ["files"],
      summary: "Stream the file contents",
      parameters: paramsFor("/v1/files/{id}/download"),
      responses: {
        "200": {
          description: "Raw file bytes",
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
      },
    }),
  },
  "/v1/files/{id}/duplicate": {
    post: op({
      tags: ["files"],
      summary: "Duplicate a file inside the same terminal",
      parameters: paramsFor("/v1/files/{id}/duplicate"),
      responses: dataResp(ref("File"), 201),
    }),
  },
  "/v1/files/{id}/permanent": {
    delete: op({
      tags: ["files"],
      summary: "Permanently delete a soft-deleted file",
      parameters: paramsFor("/v1/files/{id}/permanent"),
      responses: noContent,
    }),
  },
  "/v1/files/{id}/restore": {
    post: op({
      tags: ["files"],
      summary: "Restore a soft-deleted file",
      parameters: paramsFor("/v1/files/{id}/restore"),
      responses: dataResp(ref("File")),
    }),
  },
  "/v1/files/{id}/share-links": {
    get: todoStub("GET", "List share links for a file"),
    post: todoStub("POST", "Create a share link for a file"),
  },
  "/v1/files/{id}/signed-url": {
    get: op({
      tags: ["files"],
      summary: "Issue a short-lived signed download URL",
      parameters: paramsFor("/v1/files/{id}/signed-url"),
      responses: dataResp({
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          expires_at: { type: "string", format: "date-time" },
        },
      }),
    }),
  },

  // -- Folders ------------------------------------------------------------
  "/v1/folders/{id}": {
    patch: op({
      tags: ["files"],
      summary: "Rename or move a folder",
      parameters: paramsFor("/v1/folders/{id}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                path: { type: "string", pattern: "^/" },
                name: { type: "string" },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Folder")),
    }),
    delete: op({
      tags: ["files"],
      summary: "Delete a folder (soft)",
      parameters: paramsFor("/v1/folders/{id}"),
      responses: noContent,
    }),
  },
  "/v1/folders/{id}/duplicate": {
    post: op({
      tags: ["files"],
      summary: "Duplicate a folder and its contents",
      parameters: paramsFor("/v1/folders/{id}/duplicate"),
      responses: dataResp(ref("Folder"), 201),
    }),
  },

  // -- Tools --------------------------------------------------------------
  "/v1/tools": {
    get: op({
      tags: ["tools"],
      summary: "List tools visible to me",
      responses: listResp(ref("Tool")),
    }),
    post: op({
      tags: ["tools"],
      summary: "Register a new tool (publishes v1.0.0)",
      requestBody: { required: true, content: { "application/json": { schema: ref("ToolCreate") } } },
      responses: dataResp(
        { type: "object", properties: { id: { type: "string" }, slug: { type: "string" } } },
        201,
      ),
    }),
  },
  "/v1/tools/{slug}": {
    get: op({
      tags: ["tools"],
      summary: "Get a tool",
      parameters: paramsFor("/v1/tools/{slug}"),
      responses: dataResp(ref("Tool")),
    }),
    patch: op({
      tags: ["tools"],
      summary: "Update tool metadata",
      parameters: paramsFor("/v1/tools/{slug}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                visibility: { type: "string", enum: ["public", "space", "private"] },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Tool")),
    }),
    delete: op({
      tags: ["tools"],
      summary: "Soft-delete a tool",
      parameters: paramsFor("/v1/tools/{slug}"),
      responses: noContent,
    }),
  },
  "/v1/tools/{slug}/invoke": {
    post: op({
      tags: ["tools"],
      summary: "Invoke a tool",
      description:
        "Returns 202 with `{ status: 'approval_required', approval_id }` when admin approval is needed.",
      parameters: paramsFor("/v1/tools/{slug}/invoke"),
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("ToolInvokeRequest") } },
      },
      responses: {
        ...dataResp(ref("ToolInvokeResult")),
        "202": {
          description: "Approval required",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["approval_required"] },
                      approval_id: { type: "string", format: "uuid" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  },

  // -- Approvals ----------------------------------------------------------
  "/v1/approvals": {
    get: op({
      tags: ["approvals"],
      summary: "List approvals visible to me",
      responses: listResp(ref("Approval")),
    }),
  },
  "/v1/approvals/{id}": {
    patch: op({
      tags: ["approvals"],
      summary: "Approve or deny an approval request",
      parameters: paramsFor("/v1/approvals/{id}"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["approved", "denied"] },
                reason: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      responses: dataResp(ref("Approval")),
    }),
  },

  // -- Notifications ------------------------------------------------------
  "/v1/notifications": {
    get: op({
      tags: ["notifications"],
      summary: "List notifications for me",
      responses: listResp(ref("Notification")),
    }),
    patch: op({
      tags: ["notifications"],
      summary: "Mark notifications read",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ids: { type: "array", items: { type: "string", format: "uuid" } },
                all: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: noContent,
    }),
  },

  // -- Briefing / search --------------------------------------------------
  "/v1/briefing": {
    get: op({
      tags: ["briefing"],
      summary: "Morning briefing payload",
      responses: dataResp({
        type: "object",
        properties: {
          due_today: { type: "integer" },
          overdue: { type: "integer" },
          next_up: {
            type: "object",
            nullable: true,
            properties: {
              id: { type: "string", format: "uuid" },
              title: { type: "string" },
              due_date: { type: "string", format: "date-time", nullable: true },
              terminal_id: { type: "string", format: "uuid" },
            },
          },
        },
        additionalProperties: true,
      }),
    }),
  },
  "/v1/search": {
    get: op({
      tags: ["search"],
      summary: "Cross-terminal search (command palette)",
      responses: dataResp({
        type: "object",
        properties: {
          projects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                ticker: { type: "string" },
                name: { type: "string" },
              },
            },
          },
        },
      }),
    }),
  },

  // -- Messages -----------------------------------------------------------
  "/v1/messages/threads": {
    get: todoStub("GET", "List my message threads"),
    post: todoStub("POST", "Start a new message thread"),
  },
  "/v1/messages/threads/{id}": {
    get: todoStub("GET", "Get a message thread"),
    post: todoStub("POST", "Post to a message thread"),
  },

  // -- Calendar -----------------------------------------------------------
  "/v1/calendar/connect/{provider}": {
    get: op({
      tags: ["calendar"],
      summary: "Begin OAuth handshake for a calendar provider",
      parameters: paramsFor("/v1/calendar/connect/{provider}", {
        provider: {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["google", "microsoft"] },
        },
      }),
      responses: {
        "302": {
          description: "Redirect to provider OAuth consent screen",
          headers: { Location: { schema: { type: "string", format: "uri" } } },
        },
      },
    }),
  },
  "/v1/calendar/callback/{provider}": {
    get: op({
      tags: ["calendar"],
      summary: "OAuth callback (provider redirects here)",
      parameters: paramsFor("/v1/calendar/callback/{provider}"),
      responses: {
        "302": {
          description: "Redirect back into the app",
          headers: { Location: { schema: { type: "string", format: "uri" } } },
        },
      },
    }),
  },
  "/v1/calendar/connections/{id}": {
    delete: op({
      tags: ["calendar"],
      summary: "Disconnect a calendar connection",
      parameters: paramsFor("/v1/calendar/connections/{id}"),
      responses: noContent,
    }),
  },

  // -- Drawings -----------------------------------------------------------
  "/v1/drawings/{fileId}/annotations": {
    get: todoStub("GET", "List annotations on a drawing"),
    post: todoStub("POST", "Create a drawing annotation"),
  },
  "/v1/drawings/annotations/{id}": {
    patch: todoStub("PATCH", "Update a drawing annotation"),
    delete: todoStub("DELETE", "Delete a drawing annotation"),
  },

  // -- Share links --------------------------------------------------------
  "/v1/share/{token}": {
    get: op({
      tags: ["share"],
      summary: "Resolve a public share link",
      security: [],
      parameters: paramsFor("/v1/share/{token}"),
      responses: dataResp({
        type: "object",
        additionalProperties: true,
        description: "Shape varies by share target type.",
      }),
    }),
  },
  "/v1/share-links/{id}": {
    delete: op({
      tags: ["share"],
      summary: "Revoke a share link",
      parameters: paramsFor("/v1/share-links/{id}"),
      responses: noContent,
    }),
  },

  // -- Admin (all behind requireAdmin) -----------------------------------
  "/v1/admin/announcements": {
    get: todoStub("GET", "List platform announcements"),
    post: todoStub("POST", "Create a platform announcement"),
  },
  "/v1/admin/announcements/{id}": {
    patch: todoStub("PATCH", "Update an announcement"),
    delete: todoStub("DELETE", "Delete an announcement"),
  },
  "/v1/admin/config/{key}": {
    get: todoStub("GET", "Read a platform config value"),
    put: todoStub("PUT", "Set a platform config value"),
  },
  "/v1/admin/emergency": {
    get: todoStub("GET", "Active emergency banners"),
    post: todoStub("POST", "Trigger an emergency banner"),
  },
  "/v1/admin/emergency/{id}": {
    delete: todoStub("DELETE", "Clear an emergency banner"),
  },
  "/v1/admin/export/audit": {
    get: todoStub("GET", "Export audit log (CSV)"),
  },
  "/v1/admin/export/space/{slug}": {
    get: todoStub("GET", "Export a space's data"),
  },
  "/v1/admin/export/user/{userId}": {
    get: todoStub("GET", "Export a user's data (DSAR)"),
  },
  "/v1/admin/failed-logins": { get: todoStub("GET", "Recent failed logins") },
  "/v1/admin/flags": {
    get: todoStub("GET", "List feature flags"),
    post: todoStub("POST", "Create or update a feature flag"),
    delete: todoStub("DELETE", "Delete a feature flag"),
  },
  "/v1/admin/health": { get: todoStub("GET", "Detailed admin health view") },
  "/v1/admin/impersonate": { post: todoStub("POST", "Begin impersonating a user") },
  "/v1/admin/impersonate/end": { post: todoStub("POST", "End impersonation session") },
  "/v1/admin/invitations": { get: todoStub("GET", "List pending invitations") },
  "/v1/admin/invitations/{id}": {
    patch: todoStub("PATCH", "Update an invitation"),
    delete: todoStub("DELETE", "Cancel an invitation"),
  },
  "/v1/admin/invitations/{id}/resend": {
    post: todoStub("POST", "Resend an invitation email"),
  },
  "/v1/admin/quotas": {
    get: todoStub("GET", "List quota policies"),
    post: todoStub("POST", "Create or update a quota policy"),
    delete: todoStub("DELETE", "Delete a quota policy"),
  },
  "/v1/admin/quotas/near-cap": { get: todoStub("GET", "Users approaching their quota") },
  "/v1/admin/rate-limits": {
    get: todoStub("GET", "Recent rate-limit hits"),
    delete: todoStub("DELETE", "Clear a rate-limit counter"),
  },
  "/v1/admin/spaces": {
    get: todoStub("GET", "List all spaces"),
    post: todoStub("POST", "Create a space"),
  },
  "/v1/admin/spaces/{slug}": {
    get: todoStub("GET", "Admin view of a space"),
    patch: todoStub("PATCH", "Update a space"),
    delete: todoStub("DELETE", "Soft-delete a space"),
  },
  "/v1/admin/spaces/{slug}/members": {
    post: todoStub("POST", "Force-add a member to a space"),
  },
  "/v1/admin/spaces/{slug}/restore": {
    post: todoStub("POST", "Restore a soft-deleted space"),
  },
  "/v1/admin/spaces/{slug}/transfer-owner": {
    post: todoStub("POST", "Transfer ownership of a space"),
  },
  "/v1/admin/storage": { get: todoStub("GET", "Storage stats overview") },
  "/v1/admin/storage/cleanup-orphans": {
    post: todoStub("POST", "Delete orphaned storage objects"),
  },
  "/v1/admin/storage/rescan": { post: todoStub("POST", "Force rescan of storage objects") },
  "/v1/admin/terminals/{ticker}/archive": {
    post: todoStub("POST", "Archive a terminal"),
    delete: todoStub("DELETE", "Unarchive a terminal"),
  },
  "/v1/admin/terminals/{ticker}/transfer-owner": {
    post: todoStub("POST", "Transfer terminal ownership"),
  },
  "/v1/admin/tokens": {
    get: todoStub("GET", "List access tokens (admin scope)"),
    delete: todoStub("DELETE", "Revoke an access token (admin scope)"),
  },
  "/v1/admin/tools": { get: todoStub("GET", "All tools across the platform") },
  "/v1/admin/tools/{slug}/moderation": {
    post: todoStub("POST", "Moderate a tool (approve / disable / feature)"),
  },
  "/v1/admin/users": {
    get: op({
      tags: ["admin"],
      summary: "List users",
      parameters: [
        { name: "q", in: "query", schema: { type: "string" } },
        {
          name: "filter",
          in: "query",
          schema: { type: "string", enum: ["admins", "suspended", "active"] },
        },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } },
        { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
      ],
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user_id: { type: "string", format: "uuid" },
                        email: { type: "string", format: "email" },
                        full_name: { type: "string", nullable: true },
                        timezone: { type: "string", nullable: true },
                        is_platform_admin: { type: "boolean" },
                        created_at: { type: "string", format: "date-time" },
                        last_sign_in_at: { type: "string", format: "date-time", nullable: true },
                        banned_until: { type: "string", format: "date-time", nullable: true },
                      },
                    },
                  },
                  meta: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      limit: { type: "integer" },
                      offset: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    post: op({
      tags: ["admin"],
      summary: "Create a user",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email"],
              properties: {
                email: { type: "string", format: "email" },
                full_name: { type: "string", maxLength: 120 },
                timezone: { type: "string" },
                password: { type: "string", minLength: 8 },
                is_platform_admin: { type: "boolean", default: false },
                send_welcome_email: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: dataResp(
        {
          type: "object",
          properties: {
            user_id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            is_platform_admin: { type: "boolean" },
          },
        },
        201,
      ),
    }),
  },
  "/v1/admin/users/{userId}": {
    get: todoStub("GET", "Get a user (admin view)"),
    patch: todoStub("PATCH", "Update a user (admin)"),
    delete: todoStub("DELETE", "Delete a user (admin)"),
  },
  "/v1/admin/users/{userId}/memberships": {
    post: todoStub("POST", "Add a space membership for a user"),
    delete: todoStub("DELETE", "Remove a space membership"),
  },
  "/v1/admin/users/{userId}/notes": {
    get: todoStub("GET", "List admin notes about a user"),
    post: todoStub("POST", "Add an admin note about a user"),
  },
  "/v1/admin/users/{userId}/reset-password": {
    post: todoStub("POST", "Force a password reset email"),
  },
  "/v1/admin/users/{userId}/revoke-sessions": {
    post: todoStub("POST", "Sign a user out of all devices"),
  },
  "/v1/admin/users/{userId}/suspend": {
    post: todoStub("POST", "Suspend a user"),
    delete: todoStub("DELETE", "Lift a suspension"),
  },
  "/v1/admin/webhooks": {
    get: todoStub("GET", "List outgoing webhook subscriptions"),
    post: todoStub("POST", "Create an outgoing webhook subscription"),
  },
  "/v1/admin/webhooks/{id}": {
    patch: todoStub("PATCH", "Update an outgoing webhook"),
    delete: todoStub("DELETE", "Delete an outgoing webhook"),
  },

  // -- Markets ------------------------------------------------------------
  "/v1/markets/quote/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "Get a normalized quote",
      description: "Served from a 15s TTL cache so free-tier provider limits are respected.",
      parameters: paramsFor("/v1/markets/quote/{symbol}"),
      responses: dataResp({
        type: "object",
        required: ["quote", "cached"],
        properties: { quote: ref("MktQuote"), cached: { type: "boolean" } },
      }),
    }),
  },
  "/v1/markets/quotes": {
    get: op({
      tags: ["markets"],
      summary: "Batch quotes for a watchlist",
      parameters: [
        {
          name: "symbols",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Comma-separated symbols (max 100).",
        },
      ],
      responses: dataResp({
        type: "object",
        required: ["quotes"],
        properties: {
          quotes: {
            type: "object",
            additionalProperties: ref("MktQuote"),
            description: "Keyed by symbol.",
          },
        },
      }),
    }),
  },
  "/v1/markets/search": {
    get: op({
      tags: ["markets"],
      summary: "Search symbols by name or ticker",
      parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
      responses: dataResp({
        type: "object",
        required: ["matches"],
        properties: { matches: { type: "array", items: ref("MktSymbolMatch") } },
      }),
    }),
  },
  "/v1/markets/watchlists": {
    get: op({
      tags: ["markets"],
      summary: "List watchlists in a scope",
      parameters: [
        { name: "scope", in: "query", required: false, schema: { type: "string", enum: ["user", "space", "terminal"], default: "user" } },
        { name: "scopeId", in: "query", required: false, schema: { type: "string" }, description: "Required when scope is space or terminal." },
      ],
      responses: dataResp({
        type: "object",
        required: ["watchlists"],
        properties: { watchlists: { type: "array", items: ref("MktWatchlist") } },
      }),
    }),
    post: op({
      tags: ["markets"],
      summary: "Create a watchlist",
      requestBody: { required: true, content: { "application/json": { schema: ref("MktWatchlistCreate") } } },
      responses: dataResp({ type: "object", required: ["watchlist"], properties: { watchlist: ref("MktWatchlist") } }, 201),
    }),
  },
  "/v1/markets/watchlists/{id}": {
    patch: op({
      tags: ["markets"],
      summary: "Rename or reorder a watchlist",
      parameters: paramsFor("/v1/markets/watchlists/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("MktWatchlistPatch") } } },
      responses: dataResp({ type: "object", required: ["watchlist"], properties: { watchlist: ref("MktWatchlist") } }),
    }),
    delete: op({
      tags: ["markets"],
      summary: "Delete a watchlist",
      parameters: paramsFor("/v1/markets/watchlists/{id}"),
      responses: noContent,
    }),
  },
  "/v1/markets/watchlists/{id}/symbols": {
    post: op({
      tags: ["markets"],
      summary: "Add a symbol to a watchlist",
      parameters: paramsFor("/v1/markets/watchlists/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("MktWatchlistSymbolCreate") } } },
      responses: dataResp({ type: "object", required: ["symbol"], properties: { symbol: ref("MktWatchlistSymbol") } }, 201),
    }),
    delete: op({
      tags: ["markets"],
      summary: "Remove a symbol from a watchlist",
      parameters: [
        ...paramsFor("/v1/markets/watchlists/{id}"),
        { name: "symbol", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: noContent,
    }),
  },
  "/v1/markets/alerts": {
    get: op({
      tags: ["markets"],
      summary: "List your price alerts",
      responses: dataResp({ type: "object", required: ["alerts"], properties: { alerts: { type: "array", items: ref("MktAlert") } } }),
    }),
    post: op({
      tags: ["markets"],
      summary: "Create a price alert",
      requestBody: { required: true, content: { "application/json": { schema: ref("MktAlertCreate") } } },
      responses: dataResp({ type: "object", required: ["alert"], properties: { alert: ref("MktAlert") } }, 201),
    }),
  },
  "/v1/markets/alerts/{id}": {
    patch: op({
      tags: ["markets"],
      summary: "Toggle or modify a price alert",
      parameters: paramsFor("/v1/markets/alerts/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("MktAlertPatch") } } },
      responses: dataResp({ type: "object", required: ["alert"], properties: { alert: ref("MktAlert") } }),
    }),
    delete: op({
      tags: ["markets"],
      summary: "Delete a price alert",
      parameters: paramsFor("/v1/markets/alerts/{id}"),
      responses: noContent,
    }),
  },
  "/v1/markets/portfolios": {
    get: op({
      tags: ["markets"],
      summary: "List portfolios in a scope",
      parameters: [
        { name: "scope", in: "query", required: false, schema: { type: "string", enum: ["user", "space", "terminal"], default: "user" } },
        { name: "scopeId", in: "query", required: false, schema: { type: "string" }, description: "Required when scope is space or terminal." },
      ],
      responses: dataResp({ type: "object", required: ["portfolios"], properties: { portfolios: { type: "array", items: ref("MktPortfolio") } } }),
    }),
    post: op({
      tags: ["markets"],
      summary: "Create a portfolio",
      requestBody: { required: true, content: { "application/json": { schema: ref("MktPortfolioCreate") } } },
      responses: dataResp({ type: "object", required: ["portfolio"], properties: { portfolio: ref("MktPortfolio") } }, 201),
    }),
  },
  "/v1/markets/portfolios/{id}": {
    get: op({
      tags: ["markets"],
      summary: "Portfolio detail with live performance",
      description: "Returns the portfolio, its lot ledger, and computed positions/P&L from live quotes.",
      parameters: paramsFor("/v1/markets/portfolios/{id}"),
      responses: dataResp({
        type: "object",
        required: ["portfolio", "lots", "performance"],
        properties: {
          portfolio: ref("MktPortfolio"),
          lots: { type: "array", items: ref("MktLot") },
          performance: ref("MktPortfolioPerformance"),
        },
      }),
    }),
    patch: op({
      tags: ["markets"],
      summary: "Rename a portfolio / change base currency",
      parameters: paramsFor("/v1/markets/portfolios/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("MktPortfolioPatch") } } },
      responses: dataResp({ type: "object", required: ["portfolio"], properties: { portfolio: ref("MktPortfolio") } }),
    }),
    delete: op({
      tags: ["markets"],
      summary: "Delete a portfolio",
      parameters: paramsFor("/v1/markets/portfolios/{id}"),
      responses: noContent,
    }),
  },
  "/v1/markets/portfolios/{id}/lots": {
    get: op({
      tags: ["markets"],
      summary: "List trade lots in a portfolio",
      parameters: paramsFor("/v1/markets/portfolios/{id}"),
      responses: dataResp({ type: "object", required: ["lots"], properties: { lots: { type: "array", items: ref("MktLot") } } }),
    }),
    post: op({
      tags: ["markets"],
      summary: "Record a trade lot",
      parameters: paramsFor("/v1/markets/portfolios/{id}"),
      requestBody: { required: true, content: { "application/json": { schema: ref("MktLotCreate") } } },
      responses: dataResp({ type: "object", required: ["lot"], properties: { lot: ref("MktLot") } }, 201),
    }),
  },
  "/v1/markets/portfolios/{id}/lots/{lotId}": {
    delete: op({
      tags: ["markets"],
      summary: "Delete a trade lot",
      parameters: paramsFor("/v1/markets/portfolios/{id}/lots/{lotId}"),
      responses: noContent,
    }),
  },
  "/v1/markets/candles/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "OHLC candle series for charts",
      parameters: [
        ...paramsFor("/v1/markets/candles/{symbol}"),
        { name: "range", in: "query", required: false, schema: { type: "string", enum: ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"], default: "1Y" } },
      ],
      responses: dataResp({
        type: "object",
        required: ["symbol", "range", "candles"],
        properties: { symbol: { type: "string" }, range: { type: "string" }, candles: { type: "array", items: ref("MktCandle") } },
      }),
    }),
  },
  "/v1/markets/news/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "Recent company news",
      parameters: [
        ...paramsFor("/v1/markets/news/{symbol}"),
        { name: "days", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 60, default: 7 } },
      ],
      responses: dataResp({ type: "object", required: ["items"], properties: { items: { type: "array", items: ref("MktNewsItem") } } }),
    }),
  },
  "/v1/markets/profile/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "Company profile / fundamentals header",
      parameters: paramsFor("/v1/markets/profile/{symbol}"),
      responses: dataResp({ type: "object", required: ["profile"], properties: { profile: ref("MktCompanyProfile") } }),
    }),
  },
  "/v1/markets/movers": {
    get: op({
      tags: ["markets"],
      summary: "Top gainers / losers / most-active",
      parameters: [
        { name: "type", in: "query", required: false, schema: { type: "string", enum: ["gainers", "losers", "active"], default: "gainers" } },
      ],
      responses: dataResp({
        type: "object",
        required: ["type", "movers"],
        properties: { type: { type: "string" }, movers: { type: "array", items: ref("MktMover") } },
      }),
    }),
  },
  "/v1/markets/options/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "Options chain (stub — paid feed required)",
      description: "Returns supported:false on the free tier; structure is stable for when a paid feed is wired in.",
      parameters: paramsFor("/v1/markets/options/{symbol}"),
      responses: dataResp({
        type: "object",
        required: ["symbol", "supported", "expirations", "contracts"],
        properties: {
          symbol: { type: "string" },
          supported: { type: "boolean" },
          expirations: { type: "array", items: { type: "string" } },
          contracts: { type: "array", items: { type: "object", additionalProperties: true } },
          note: { type: "string" },
        },
      }),
    }),
  },
  "/v1/markets/financials/{symbol}": {
    get: op({
      tags: ["markets"],
      summary: "Financial statements",
      description: "Cached 24h.",
      parameters: [
        ...paramsFor("/v1/markets/financials/{symbol}"),
        { name: "statement", in: "query", required: false, schema: { type: "string", enum: ["income", "balance", "cash"], default: "income" } },
      ],
      responses: dataResp({ type: "object", required: ["report"], properties: { report: ref("MktFinancialReport") } }),
    }),
  },
  "/v1/markets/overview": {
    get: op({
      tags: ["markets"],
      summary: "Market overview board",
      description: "Indices, sectors, commodities, and FX in one call.",
      responses: dataResp({
        type: "object",
        required: ["indices", "sectors", "commodities", "fx"],
        properties: {
          indices: { type: "array", items: ref("MktOverviewRow") },
          sectors: { type: "array", items: ref("MktOverviewRow") },
          commodities: { type: "array", items: ref("MktOverviewRow") },
          fx: { type: "array", items: ref("MktOverviewRow") },
        },
      }),
    }),
  },
  "/v1/markets/calendar": {
    get: op({
      tags: ["markets"],
      summary: "Earnings calendar",
      parameters: [
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date" } },
      ],
      responses: dataResp({
        type: "object",
        required: ["from", "to", "events"],
        properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, events: { type: "array", items: ref("MktEarningsEvent") } },
      }),
    }),
  },
  "/v1/markets/screener": {
    post: op({
      tags: ["markets"],
      summary: "Screen stocks by price / % change / market cap",
      description: "Fundamental filters (P/E, yield) require a paid feed; this screens from free quotes.",
      requestBody: { required: false, content: { "application/json": { schema: ref("MktScreenerRequest") } } },
      responses: dataResp({
        type: "object",
        required: ["count", "results"],
        properties: { count: { type: "integer" }, results: { type: "array", items: ref("MktQuote") }, note: { type: "string" } },
      }),
    }),
  },
  "/v1/markets/fx": {
    get: op({
      tags: ["markets"],
      summary: "Convert a currency amount",
      parameters: [
        { name: "from", in: "query", required: true, schema: { type: "string" } },
        { name: "to", in: "query", required: true, schema: { type: "string" } },
        { name: "amount", in: "query", required: false, schema: { type: "number", default: 1 } },
      ],
      responses: dataResp({
        type: "object",
        required: ["from", "to", "rate", "amount", "converted"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          rate: { type: "number" },
          amount: { type: "number" },
          converted: { type: "number" },
        },
      }),
    }),
  },
};

// ---------------------------------------------------------------------------
// Final document
// ---------------------------------------------------------------------------

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Rokki API",
    version: VERSION,
    description: [
      "Public REST API for Rokki — the Bloomberg-inspired AI-native work platform.",
      "",
      "**This spec is generated from the route handlers under `apps/web/src/app/api/v1/**`.**",
      "Don't edit it by hand — instead, change the handler (and the matching entry",
      "in `apps/web/src/lib/openapi.ts`) so the contract stays in sync with the",
      "code that actually serves it.",
      "",
      "Auth: every route uses cookie-based session via Supabase by default.",
      "Programmatic clients (the SDK, CLI, MCP) can substitute a personal access",
      "token with `Authorization: Bearer rk_live_…`.",
    ].join("\n"),
    contact: { name: "Rokki", url: "https://rokki.ai" },
    license: { name: "See LICENSE" },
  },
  servers: [
    { url: "https://rokki.ai/api", description: "Production" },
    { url: "https://staging.rokki.ai/api", description: "Staging" },
    { url: "http://localhost:3000/api", description: "Local development" },
  ],
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  tags: [
    { name: "health", description: "Service liveness probes." },
    { name: "me", description: "Caller's profile, tokens, BYOK keys, push subscriptions." },
    { name: "auth", description: "Session lifecycle." },
    { name: "spaces", description: "Tenant-level objects (companies, families, households)." },
    { name: "terminals", description: "Working contexts inside a space (a project, matter, client)." },
    { name: "tasks", description: "Tasks, subtasks, comments, assignees, watchers." },
    { name: "files", description: "Files and folders inside a terminal." },
    { name: "markets", description: "Quotes, charts, watchlists, portfolios, alerts, and market data." },
    { name: "tools", description: "Marketplace tools and invocations." },
    { name: "approvals", description: "Approval requests for guarded actions." },
    { name: "comments", description: "Comments on any commentable target." },
    { name: "notifications", description: "User notifications inbox." },
    { name: "briefing", description: "Morning briefing rollups." },
    { name: "search", description: "Cross-terminal search." },
    { name: "calendar", description: "Calendar OAuth + connections." },
    { name: "share", description: "Public share links." },
    { name: "admin", description: "Platform-admin-only endpoints." },
  ],
  components: { securitySchemes, schemas },
  paths,
} as const;

export type OpenApiDocument = typeof openApiDocument;
