import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://uxnswzyljpwenpinxqee.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4bnN3enlsanB3ZW5waW54cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNjMyODMsImV4cCI6MjEwOTkzOTI4M30.DoTPDPbI_zkApaSh8MAcSUrBb5Ju3JuetV9xvRdMlGs';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

