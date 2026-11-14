// Clan chat (migration 0013), run against the real migrations in PGlite, as the
// `authenticated` role with RLS on, the way PostgREST and Realtime see it.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat, dan, eve;
let rats, owls; // two clans
before(async () => {
  t = await createDb();
  [ana, ben, cat, dan, eve] = await Promise.all(["Ana", "Ben", "Cat", "Dan", "Eve"].map((n) => t.user(n)));
});
after(() => t.close());

const one = async (p) => (await p)[0];
const val = async (p) => Object.values(await one(p))[0];
const rejects = async (p, hint, message) => {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    if (message) assert.match(err.message, message);
    return true;
  });
};
const send = (who, clan, body, clientId) => val(who.rpc("send_clan_message", { p_clan_id: clan, p_body: body, ...(clientId ? { p_client_id: clientId } : {}) }));
const page = (who, clan, args = {}) => val(who.rpc("clan_messages_page", { p_clan_id: clan, ...args }));
const status = (who) => val(who.rpc("clan_chat_status"));
const texts = (p) => p.messages.map((m) => (m.kind === "system" ? `[${m.event}] ${m.body}` : `${m.authorName}: ${m.body}`));
/** Let the per-person send limit (10 per 10 seconds) reset between tests. */
const cool = (who) => t.db.query("update public.clan_messages set created_at = created_at - interval '1 minute' where user_id = $1", [who.id]);

describe("clan chat", () => {
  test("every clan has a chat from the start, and joining is announced", async () => {
    rats = (await val(ana.rpc("create_clan", { p_name: "Gym Rats" }))).id;
    const code = (await val(ana.rpc("my_social_state"))).clan.code;
    await ben.rpc("join_clan", { p_code: code });
    await ben.rpc("join_clan", { p_code: code }); // joining again is harmless and says nothing
    owls = (await val(cat.rpc("create_clan", { p_name: "Night Owls" }))).id;
    assert.deepEqual(texts(await page(ana, rats)), ["[clan_created] Ana started the clan.", "[member_joined] Ben joined the clan."]);
    assert.deepEqual(texts(await page(cat, owls)), ["[clan_created] Cat started the clan."]);
  });

  test("members exchange messages; the sender is always the caller, with their name and picture", async () => {
    const m = await send(ana, rats, "  Leg day tomorrow?  ");
    assert.equal(m.body, "Leg day tomorrow?");
    assert.deepEqual([m.userId, m.authorName, m.kind, m.deleted], [ana.id, "Ana", "text", false]);
    assert.match(m.createdAt, /^\d{4}-\d\d-\d\dT/);
    await send(ben, rats, "Only if we bet on it 🏋️‍♂️🔥");
    const p = await page(ben, rats);
    assert.deepEqual(texts(p).slice(-2), ["Ana: Leg day tomorrow?", "Ben: Only if we bet on it 🏋️‍♂️🔥"]);
    // Nothing in the call can name another sender: the only way in is the function, and it has no such argument.
    await assert.rejects(ana.rpc("send_clan_message", { p_clan_id: rats, p_body: "hi", p_user_id: ben.id }));
  });

  test("nobody can write the table directly, even their own rows", async () => {
    await assert.rejects(ana.as("insert into public.clan_messages(clan_id, user_id, kind, body) values ($1, $2, 'text', 'x')", [rats, ana.id]));
    await assert.rejects(ana.as("update public.clan_messages set body = 'edited' where clan_id = $1", [rats]));
    await assert.rejects(ana.as("delete from public.clan_messages where clan_id = $1", [rats]));
  });

  test("members read only their own clan's chat; nonmembers and other clans see nothing", async () => {
    // Direct reads (what Realtime's policy check does) return only your clan's rows.
    const mine = await ana.as("select clan_id from public.clan_messages");
    assert.ok(mine.length > 0 && mine.every((r) => r.clan_id === rats));
    assert.equal((await cat.as("select * from public.clan_messages where clan_id = $1", [rats])).length, 0);
    assert.equal((await dan.as("select * from public.clan_messages")).length, 0);
    // And the functions refuse outright.
    await rejects(page(cat, rats), "not_clan_member");
    await rejects(page(dan, rats), "not_clan_member");
    await rejects(send(cat, rats, "let me in"), "not_clan_member");
    await rejects(send(dan, rats, "hello?"), "not_clan_member");
    await rejects(ana.rpc("mark_clan_chat_read", { p_clan_id: owls, p_message_id: 1 }), "not_clan_member");
    assert.deepEqual(await status(dan), { clanId: null, lastId: null, unread: 0 });
  });

  test("the server cleans up and checks every message", async () => {
    await cool(ana);
    await rejects(send(ana, rats, ""), "invalid_message", /Write something/);
    await rejects(send(ana, rats, " \n\t \r\n "), "invalid_message");
    await rejects(send(ana, rats, "x".repeat(2001)), "invalid_message", /2,000/);
    await rejects(send(ana, rats, null), "invalid_message");
    // Line breaks are kept (Windows ones normalized), long runs of blank lines shortened, control characters dropped.
    const m = await send(ana, rats, "line one\r\nline two\n\n\n\n\n\nlast\u0007");
    assert.equal(m.body, "line one\nline two\n\n\nlast");
    // The limit counts characters, so emoji count once each.
    assert.equal((await send(ana, rats, "😀".repeat(2000))).body.length, 4000);
  });

  test("resending with the same client id returns the first message instead of a duplicate", async () => {
    await cool(ana);
    const id = randomUUID();
    const first = await send(ana, rats, "only once", id);
    const again = await send(ana, rats, "only once", id);
    assert.equal(again.id, first.id);
    assert.equal(again.clientId, id);
    const [{ n }] = (await t.db.query("select count(*)::int as n from public.clan_messages where client_id = $1", [id])).rows;
    assert.equal(n, 1);
    // Client ids are per sender: someone else using the same one still posts their own message.
    const benCopy = await send(ben, rats, "mine", id);
    assert.notEqual(benCopy.id, first.id);
  });

  test("you can delete your own messages, not anyone else's, and not system messages", async () => {
    await cool(ana);
    const m = await send(ana, rats, "oops, wrong chat");
    await rejects(ben.rpc("delete_clan_message", { p_message_id: m.id }), "not_message_author");
    await rejects(cat.rpc("delete_clan_message", { p_message_id: m.id }), "message_not_found");
    await rejects(ana.rpc("delete_clan_message", { p_message_id: 99999999 }), "message_not_found");
    const sys = (await page(ana, rats)).messages.find((x) => x.kind === "system");
    await rejects(ana.rpc("delete_clan_message", { p_message_id: sys.id }), "not_message_author");
    const gone = await val(ana.rpc("delete_clan_message", { p_message_id: m.id }));
    assert.deepEqual([gone.id, gone.body, gone.deleted], [m.id, "", true]);
    assert.equal((await val(ana.rpc("delete_clan_message", { p_message_id: m.id }))).deleted, true); // twice is harmless
    // Everyone sees the marker, and the text is gone from the table itself.
    assert.deepEqual((await page(ben, rats)).messages.find((x) => x.id === m.id), { ...gone });
    const [{ body }] = (await t.db.query("select body from public.clan_messages where id = $1", [m.id])).rows;
    assert.equal(body, "");
  });

  test("too many messages too fast are refused", async () => {
    await cool(ben);
    for (let i = 0; i < 10; i++) await send(ben, rats, `spam ${i}`);
    await rejects(send(ben, rats, "one more"), "slow_down");
    await cool(ben);
    await send(ben, rats, "ok now");
  });

  test("history comes in pages: newest first page, older before an id, newer after an id", async () => {
    for (const who of [ana, ben]) await cool(who);
    for (let i = 0; i < 60; i++) {
      await send(i % 2 ? ana : ben, rats, `msg ${i}`);
      if (i % 9 === 8) for (const who of [ana, ben]) await cool(who);
    }
    const latest = await page(ana, rats);
    assert.equal(latest.messages.length, 50);
    assert.equal(latest.hasMore, true);
    assert.equal(latest.messages.at(-1).body, "msg 59");
    const ids = latest.messages.map((m) => m.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "oldest first");

    const older = await page(ana, rats, { p_before: ids[0], p_limit: 20 });
    assert.equal(older.messages.length, 20);
    assert.ok(older.messages.at(-1).id < ids[0]);

    const newer = await page(ana, rats, { p_after: ids[39] });
    assert.deepEqual(newer.messages.map((m) => m.id), ids.slice(40));
    assert.equal(newer.hasMore, false);
    assert.deepEqual((await page(ana, rats, { p_after: ids.at(-1) })).messages, []);

    // Walking back to the start ends with hasMore false; pages are capped at 100.
    let before = ids[0];
    let all = [...ids];
    for (;;) {
      const p = await page(ana, rats, { p_before: before, p_limit: 1000 });
      assert.ok(p.messages.length <= 100);
      all = [...p.messages.map((m) => m.id), ...all];
      if (!p.hasMore) break;
      before = p.messages[0].id;
    }
    const [{ n }] = (await t.db.query("select count(*)::int as n from public.clan_messages where clan_id = $1", [rats])).rows;
    assert.equal(all.length, n);
    assert.equal(new Set(all).size, n, "no message appears twice across pages");
  });

  test("unread counts other people's messages since you last read; your own don't count", async () => {
    const before = await status(ben);
    assert.equal(before.clanId, rats);
    await val(ben.rpc("mark_clan_chat_read", { p_clan_id: rats, p_message_id: before.lastId }));
    assert.equal((await status(ben)).unread, 0);
    await cool(ana);
    await send(ana, rats, "you there?");
    await send(ana, rats, "hello??");
    assert.equal((await status(ben)).unread, 2);
    assert.equal((await page(ben, rats)).unread, 2);
    assert.equal((await status(ana)).unread, 0, "your own messages never count");
    // Replying means you've seen the chat: sending marks it read for the sender.
    await send(ben, rats, "yes");
    assert.equal((await status(ben)).unread, 0);
    await send(ana, rats, "great");
    assert.equal((await status(ben)).unread, 1);
    const s = await val(ben.rpc("mark_clan_chat_read", { p_clan_id: rats, p_message_id: (await status(ben)).lastId }));
    assert.equal(s.unread, 0);
    // Marking an older message read never moves it backwards.
    await val(ben.rpc("mark_clan_chat_read", { p_clan_id: rats, p_message_id: 1 }));
    assert.equal((await status(ben)).unread, 0);
  });

  test("new members see the existing history, starting with nothing unread", async () => {
    const code = (await val(ana.rpc("my_social_state"))).clan.code;
    await dan.rpc("join_clan", { p_code: code });
    const first = await page(dan, rats, { p_limit: 100 });
    assert.ok(first.messages.some((m) => m.body === "Leg day tomorrow?") || first.hasMore);
    assert.equal(first.messages.at(-1).body, "Dan joined the clan.");
    assert.equal((await status(dan)).unread, 0);
  });

  test("leaving revokes access at once; ownership changes and closing a clan are handled", async () => {
    // Ana owns the Gym Rats. When she leaves, Ben (the longest-standing member) takes over.
    await ana.rpc("leave_clan");
    const p = await page(ben, rats);
    assert.deepEqual(texts(p).slice(-2), ["[member_left] Ana left the clan.", "[owner_changed] Ben is now the clan owner."]);
    assert.deepEqual(p.messages.at(-1).data, { from: ana.id, to: ben.id });
    // Ana's old messages stay, under her name.
    assert.ok((await page(ben, rats, { p_limit: 100 })).messages.some((m) => m.authorName === "Ana" && m.kind === "text"));
    // She can no longer read, send, mark read, or delete her own old messages.
    await rejects(page(ana, rats), "not_clan_member");
    await rejects(send(ana, rats, "wait, come back"), "not_clan_member");
    assert.equal((await ana.as("select * from public.clan_messages")).length, 0);
    const hers = (await t.db.query("select id from public.clan_messages where user_id = $1 and kind = 'text' and deleted_at is null limit 1", [ana.id])).rows[0];
    await rejects(ana.rpc("delete_clan_message", { p_message_id: hers.id }), "message_not_found");

    // Joining another clan gives her that chat, not the old one.
    const owlCode = (await val(cat.rpc("my_social_state"))).clan.code;
    await ana.rpc("join_clan", { p_code: owlCode });
    assert.deepEqual(texts(await page(ana, owls)).at(-1), "[member_joined] Ana joined the clan.");
    assert.ok((await ana.as("select clan_id from public.clan_messages")).every((r) => r.clan_id === owls));

    // The last one out closes the clan, and its chat goes with it.
    await ben.rpc("leave_clan");
    await dan.rpc("leave_clan");
    const [{ n }] = (await t.db.query("select count(*)::int as n from public.clan_messages where clan_id = $1", [rats])).rows;
    assert.equal(n, 0);
    assert.equal((await t.db.query("select 1 from public.clans where id = $1", [rats])).rows.length, 0);
  });

  test("deleting a clan outright (cascade) also removes its chat cleanly", async () => {
    const id = (await val(eve.rpc("create_clan", { p_name: "Short Lived" }))).id;
    await t.db.query("delete from public.clans where id = $1", [id]);
    const [{ n }] = (await t.db.query("select count(*)::int as n from public.clan_messages where clan_id = $1", [id])).rows;
    assert.equal(n, 0);
  });
});
