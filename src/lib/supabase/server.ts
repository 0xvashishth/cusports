import { readFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function readEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!envPath) return {};

  try {
    const contents = readFileSync(envPath, "utf8");
    return Object.fromEntries(
      contents
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          const value = rest
            .join("=")
            .trim()
            .replace(/^['"]|['"]$/g, "");
          return [key.trim(), value];
        }),
    );
  } catch {
    return {};
  }
}

export async function createClient() {
  const cookieStore = await cookies();
  const envValues = readEnvFile();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || envValues.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    envValues.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase client environment variables");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {}
      },
    },
  });
}
