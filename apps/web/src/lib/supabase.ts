/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to apps/web/.env.local, or run `npm run dev:local` for the local stack.",
  );
}

export const supabase = createClient<Database>(url, key);

// True only in dev against the local Supabase stack, where the seeded test users exist.
export const isLocalStack = import.meta.env.DEV && ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
