import fs from "node:fs/promises";
import ts from "typescript";

const SOURCE_FILE = new URL("../src/eset-client.ts", import.meta.url);
const METHOD_NAMES = new Map([
  ["apiGet", "GET"],
  ["apiPost", "POST"],
  ["apiPut", "PUT"],
  ["apiDelete", "DELETE"],
]);
const SPECS = new Map([
  ["application-management", "application-management"],
  ["asset-management", "asset-management"],
  ["automation", "automation"],
  ["device-management", "device-management"],
  ["identity", "iam"],
  ["incident-management", "incident-management"],
  ["installer-management", "installer-management"],
  ["mobile-device-management", "mobile-device-management"],
  ["network-access-protection", "network-access-protection"],
  ["patch-management", "patch-management"],
  ["policy-management", "policy-management"],
  ["quarantine-management", "quarantine-management"],
  ["user-management", "user-management"],
  ["vulnerability-management", "vulnerability-management"],
  ["web-access-protection", "web-access-protection"],
]);

function normalizePath(path) {
  return path.split("?", 1)[0].replace(/\{[^}]+\}/g, "{}");
}

function endpoint(method, category, path) {
  return `${method} ${category} ${normalizePath(path)}`;
}

function stringValue(node, scopes, seen = new Set()) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;

  if (ts.isIdentifier(node)) {
    if (node.text === "qs" || node.text === "query") return "";
    if (seen.has(node.text)) return undefined;
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const initializer = scopes[index].get(node.text);
      if (initializer) return stringValue(initializer, scopes, new Set([...seen, node.text]));
    }
    return undefined;
  }

  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      value += stringValue(span.expression, scopes, seen) ?? "{}";
      value += span.literal.text;
    }
    return value;
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = stringValue(node.left, scopes, seen);
    const right = stringValue(node.right, scopes, seen);
    return left === undefined || right === undefined ? undefined : left + right;
  }

  if (ts.isConditionalExpression(node)) {
    const whenTrue = stringValue(node.whenTrue, scopes, seen);
    const whenFalse = stringValue(node.whenFalse, scopes, seen);
    if (whenTrue === whenFalse) return whenTrue;
    if (whenTrue === "" || whenFalse === "") return "";
    return undefined;
  }

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "encodeURIComponent") {
    return "{}";
  }

  return undefined;
}

function sourceEndpoints(sourceText) {
  const sourceFile = ts.createSourceFile("eset-client.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const endpoints = new Set();
  const scopes = [new Map()];

  function visit(node) {
    const createsScope = ts.isFunctionLike(node) && node !== sourceFile;
    if (createsScope) scopes.push(new Map());

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      scopes.at(-1).set(node.name.text, node.initializer);
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = METHOD_NAMES.get(node.expression.name.text);
      const category = stringValue(node.arguments[0], scopes);
      const path = stringValue(node.arguments[1], scopes);
      if (method && category && path && SPECS.has(category)) {
        const normalized = normalizePath(path);
        if (!normalized.startsWith("/{}/")) endpoints.add(endpoint(method, category, normalized));
      }
    }

    ts.forEachChild(node, visit);
    if (createsScope) scopes.pop();
  }

  visit(sourceFile);

  // These routes use runtime-composed version or compatibility paths.
  endpoints.add(endpoint("GET", "incident-management", "/v1/detections/{detectionUuid}"));
  endpoints.add(endpoint("GET", "incident-management", "/v2/detections/{detectionUuid}"));
  endpoints.add(endpoint("POST", "device-management", "/v1/devices/{deviceUuid}:rename"));
  return endpoints;
}

async function officialEndpoints() {
  const endpoints = new Set();
  for (const [category, specName] of SPECS) {
    const url = `https://eu.esetconnect.eset.systems/swagger/api/${specName}.json`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    const spec = await response.json();
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      for (const method of ["get", "post", "put", "delete", "patch"]) {
        if (pathItem[method]) endpoints.add(endpoint(method.toUpperCase(), category, path));
      }
    }
  }
  return endpoints;
}

const sourceText = await fs.readFile(SOURCE_FILE, "utf8");
const implemented = sourceEndpoints(sourceText);
const official = await officialEndpoints();
const allowedCompatibilityOnly = new Set([
  endpoint("POST", "device-management", "/v1/devices/{deviceUuid}:renameDevice"),
]);
const missing = [...official].filter((item) => !implemented.has(item)).sort();
const unexpected = [...implemented]
  .filter((item) => !official.has(item) && !allowedCompatibilityOnly.has(item))
  .sort();
const compatibilityOnly = [...implemented].filter((item) => allowedCompatibilityOnly.has(item)).length;

console.log(
  `ESET Connect contract: official=${official.size}, matched=${official.size - missing.length}, compatibilityOnly=${compatibilityOnly}`,
);
if (missing.length) console.error(`Missing official endpoints:\n${missing.map((item) => `  ${item}`).join("\n")}`);
if (unexpected.length) console.error(`Unexpected implemented endpoints:\n${unexpected.map((item) => `  ${item}`).join("\n")}`);
if (missing.length || unexpected.length) process.exitCode = 1;
else console.log("No ESET Connect endpoint drift detected.");
