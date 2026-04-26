/**
 * GET /api/docs
 *
 * Renders Swagger UI from the swagger-ui-dist CDN against
 * `/api/openapi.json`. Themed dark to match the Bloomberg aesthetic. We
 * deliberately avoid the swagger-ui-dist npm dependency — pulling it
 * server-side bloats the build and serving from CDN keeps the page a
 * single fetch.
 *
 * The CDN version is pinned (5.17.14) so a CDN regression can't break
 * the page silently.
 */
const SWAGGER_VERSION = "5.17.14";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rokki API — Reference</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css"
      crossorigin="anonymous"
    />
    <style>
      :root {
        --rokki-bg: #0a0c10;
        --rokki-panel: #11151c;
        --rokki-border: #1f2530;
        --rokki-fg: #e6e8ee;
        --rokki-muted: #8a93a3;
        --rokki-accent: #ff8c1a;
      }
      html, body { background: var(--rokki-bg); color: var(--rokki-fg); margin: 0; }
      body, .swagger-ui, .swagger-ui * {
        font-family: ui-monospace, SFMono-Regular, 'Geist Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
      }
      .rokki-banner {
        padding: 16px 24px;
        border-bottom: 1px solid var(--rokki-border);
        background: var(--rokki-panel);
        display: flex; justify-content: space-between; align-items: center;
        gap: 16px; flex-wrap: wrap;
      }
      .rokki-banner h1 {
        margin: 0; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase;
        color: var(--rokki-fg);
      }
      .rokki-banner h1 span { color: var(--rokki-accent); }
      .rokki-note {
        font-size: 11px; color: var(--rokki-muted); max-width: 720px;
      }
      .swagger-ui, .swagger-ui .info, .swagger-ui .scheme-container,
      .swagger-ui .opblock, .swagger-ui .opblock-tag, .swagger-ui .opblock .opblock-section-header,
      .swagger-ui .opblock-body, .swagger-ui .responses-wrapper, .swagger-ui table,
      .swagger-ui select, .swagger-ui input, .swagger-ui textarea {
        background: var(--rokki-bg) !important; color: var(--rokki-fg) !important;
        border-color: var(--rokki-border) !important;
      }
      .swagger-ui .opblock { border: 1px solid var(--rokki-border) !important; }
      .swagger-ui .opblock-tag { color: var(--rokki-fg) !important; border-bottom: 1px solid var(--rokki-border); }
      .swagger-ui .opblock .opblock-summary-method {
        font-weight: 700; min-width: 80px; text-align: center; border-radius: 2px;
      }
      .swagger-ui .opblock-summary-path,
      .swagger-ui .opblock-summary-description,
      .swagger-ui .info .title,
      .swagger-ui .info p, .swagger-ui .info li, .swagger-ui label,
      .swagger-ui .parameter__name, .swagger-ui .parameter__type, .swagger-ui .response-col_status,
      .swagger-ui .response-col_links {
        color: var(--rokki-fg) !important;
      }
      .swagger-ui .opblock-summary-description, .swagger-ui .markdown p,
      .swagger-ui .markdown li { color: var(--rokki-muted) !important; }
      .swagger-ui .info hgroup.main a, .swagger-ui a, .swagger-ui .info a {
        color: var(--rokki-accent) !important;
      }
      .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea {
        background: var(--rokki-panel) !important;
      }
      .swagger-ui .topbar { display: none; }
      .swagger-ui .scheme-container { box-shadow: none; }
      .swagger-ui svg { fill: var(--rokki-fg); }
      .swagger-ui .btn {
        background: var(--rokki-panel) !important; color: var(--rokki-fg) !important;
        border: 1px solid var(--rokki-border) !important;
      }
      .swagger-ui .btn.execute { background: var(--rokki-accent) !important; color: #000 !important; border-color: var(--rokki-accent) !important; }
    </style>
  </head>
  <body>
    <div class="rokki-banner">
      <h1>ROKKI <span>API REFERENCE</span></h1>
      <div class="rokki-note">
        Generated from route handlers in <code>apps/web/src/app/api/v1/**</code>.
        Don't edit by hand &mdash; edit the handler comments instead.
      </div>
    </div>
    <div id="swagger-ui"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js"
      crossorigin="anonymous"
    ></script>
    <script>
      window.addEventListener('load', function () {
        window.ui = SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          docExpansion: 'list',
          defaultModelsExpandDepth: 1,
          tryItOutEnabled: true,
          persistAuthorization: true,
          displayRequestDuration: true,
        });
      });
    </script>
  </body>
</html>
`;

export const dynamic = "force-static";

export function GET() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
