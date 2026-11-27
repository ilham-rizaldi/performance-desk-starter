import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { dateRange } from "./providers.mjs";
import { starterRequest } from "./hosted.mjs";

const origin = "https://ilham-rizaldi.github.io";
const endpoint = "https://example.test/api/starter";

test("a private bookmark is required before any read or refresh", async () => {
  const key = randomBytes(32).toString("base64url");
  const env = { STARTER_ACCESS_HASH: createHash("sha256").update(key).digest("base64url") };
  const request = (method, location, bearer) => new Request(endpoint, {
    method, headers: { Origin: location, ...(bearer && { Authorization: `Bearer ${bearer}` }) },
  });
  assert.equal((await starterRequest(request("GET", origin), env)).status, 403);
  assert.equal((await starterRequest(request("POST", "https://other.test", key), env)).status, 403);
  assert.equal((await starterRequest(request("PUT", origin, key), env)).status, 403);
  const preflight = await starterRequest(request("OPTIONS", origin), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal((await starterRequest(request("OPTIONS", "https://other.test"), env)).status, 403);
});

test("cloud report dates use Jakarta at the UTC boundary", () => {
  assert.equal(dateRange(new Date("2026-11-27T18:00:00Z"), "Asia/Jakarta").reportDate, "2026-11-28");
});
