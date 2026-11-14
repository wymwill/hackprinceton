import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [, , countArg = "10"] = process.argv;
const count = Number(countArg);
if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error("Choose between 1 and 50 users.");
const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/).filter((x) => x && !x.startsWith("#")).map((line) => {
  const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)];
}));
const secret = (await readFile(".supabase-test-secret", "utf8")).trim();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !secret) throw new Error("Missing Supabase project URL or local secret key file.");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const created = [];
const suffix = randomBytes(3).toString("hex");
try {
  for (let i = 1; i <= count; i++) {
    const email = `bookie-demo-${suffix}-${String(i).padStart(2, "0")}@example.com`;
    const password = `Demo-${randomBytes(9).toString("base64url")}aA7!`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: `Bookie Demo ${String(i).padStart(2, "0")}`, demo_account: true },
    });
    if (error) throw new Error(`Creation stopped after ${created.length} users: ${error.message}`);
    created.push({ email, password, user_id: data.user.id, email_confirmed: "yes" });
  }
  const csv = ["email,password,user_id,email_confirmed", ...created.map((u) => `${u.email},${u.password},${u.user_id},${u.email_confirmed}`)].join("\n") + "\n";
  await writeFile(".supabase-demo-users.csv", csv, { flag: "wx" });
  console.log(`Created ${created.length} confirmed demo users. Credentials saved to ignored .supabase-demo-users.csv.`);
} catch (error) {
  for (const user of created) await admin.auth.admin.deleteUser(user.user_id);
  throw error;
}
