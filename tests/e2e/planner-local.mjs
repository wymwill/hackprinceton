// Run against a production Next server and tests/sql/local-supabase.mjs, with GOOGLE_API_KEY and GEMINI_API_KEY empty.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const API = process.env.API_URL ?? "http://127.0.0.1:3218";
const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54429";
for (const url of [API, AUTH]) if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Use local test servers only.");
const input = { prompt: "A weekend game for four roommates", players: 4, questionCount: 3 };
const signup = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "local" }, body: JSON.stringify({ email: `planner-${randomUUID()}@example.com`, password: "local-test-only-password" }) });
const session = await signup.json();
assert.ok(session.access_token);
async function call(body, token = session.access_token) {
  const response = await fetch(`${API}/api/series/plan`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
assert.equal((await call(input, null)).status, 401);
assert.equal((await call({ ...input, prompt: "short" })).status, 400);
assert.equal((await call({ ...input, questionCount: 100 })).status, 400);
assert.equal((await call({ ...input, userId: "another-account" })).status, 400);
const unavailable = await call(input);
assert.equal(unavailable.status, 503, JSON.stringify(unavailable.body));
assert.equal(unavailable.body.error.code, "planner_unavailable");
console.log("Planner production API: unauthenticated requests, invalid inputs, forged fields and missing configuration verified. No model calls made.");
