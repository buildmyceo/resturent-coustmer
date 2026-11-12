import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const DEFAULT_SUPABASE_URL = 'https://uxnswzyljpwenpinxqee.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4bnN3enlsanB3ZW5waW54cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNjMyODMsImV4cCI6MjEwOTkzOTI4M30.DoTPDPbI_zkApaSh8MAcSUrBb5Ju3JuetV9xvRdMlGs';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored when called from Server Components
          }
        },
      },
    }
  );
}

