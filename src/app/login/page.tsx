import { connection } from "next/server";
import { Suspense } from "react";
import { authMode, supabaseConfig } from "@/lib/authConfig";
import Login from "@/screens/Login";

export const metadata = { title: "Sign in · Alea" };

/** The auth config comes from the server's environment at request time, so one build works in every mode. */
async function LoginWithConfig() {
  await connection();
  const config = supabaseConfig();
  return <Login mode={authMode()} supabase={config} />;
}

export default function Page() {
  return (
    <Suspense>
      <LoginWithConfig />
    </Suspense>
  );
}
