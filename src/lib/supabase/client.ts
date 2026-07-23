import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const { publishableKey, url } = getSupabaseConfig();

  return createSupabaseClient(url, publishableKey, {
    auth: {
      detectSessionInUrl: true,
      flowType: "implicit",
      persistSession: true,
    },
  });
}
