import { createBrowserClient } from "@supabase/ssr";

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
}

export function isSupabaseConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return false;
  if (url.includes("your-project")) return false;
  if (key.includes("your-anon-key")) return false;
  return true;
}

/**
 * A support and testing switch. With this set in the browser's storage
 * (localStorage["mw-force-offline"] = "1") every connection to the server fails
 * at once, as if there were no signal, so offline behaviour can be checked on
 * any device without switching its network off. It changes nothing for anyone
 * who hasn't set it.
 */
const FORCE_OFFLINE_KEY = "mw-force-offline";

function connectionFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(FORCE_OFFLINE_KEY) === "1") {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
  } catch {
    // Storage unavailable: behave normally.
  }
  return fetch(input, init);
}

export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserClient(url, key, { global: { fetch: connectionFetch } });
}
