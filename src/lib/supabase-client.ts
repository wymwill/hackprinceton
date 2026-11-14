"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client:SupabaseClient|undefined;
export function getSupabaseClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) return null;
 // Keep the auth session across reloads and browser tabs so joined series can be restored.
 client ??= createClient(url,key);
 return client;
}
