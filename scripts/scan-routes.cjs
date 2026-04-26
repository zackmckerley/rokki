/* Walks apps/web/src/app/api/v1 and prints { apiPath, methods, file } JSON for each route handler. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "apps", "web", "src", "app", "api", "v1");

function walk(dir, files) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (f === "route.ts") files.push(p);
  }
  return files;
}

const ASSIGN_RE = /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=/g;
const FUNC_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)/g;

const routes = walk(ROOT, []);
const out = [];
for (const r of routes) {
  const text = fs.readFileSync(r, "utf8");
  const methods = new Set();
  let m;
  while ((m = ASSIGN_RE.exec(text))) methods.add(m[1]);
  while ((m = FUNC_RE.exec(text))) methods.add(m[1]);
  const sep = path.sep;
  let rel = r.substring(ROOT.length);
  while (rel.startsWith(sep)) rel = rel.substring(1);
  rel = rel.split(sep).join("/").replace(/\/route\.ts$/, "");
  const apiPath = "/v1/" + rel.replace(/\[([^\]]+)\]/g, "{$1}");
  out.push({
    apiPath,
    methods: [...methods].sort(),
    file: rel + "/route.ts",
  });
}
out.sort((a, b) => a.apiPath.localeCompare(b.apiPath));
console.log(JSON.stringify(out, null, 2));
