import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://hufcbxodgxinbvpqfaaw.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZmNieG9kZ3hpbmJ2cHFmYWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NjkzMjgsImV4cCI6MjA4ODA0NTMyOH0.YzN3gLEcEt8ZhmpBIrxLZ9TJhbEJxl5Hq2ZHIGTQyWQ';

export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = createClient();

export type SupabaseClient = ReturnType<typeof createClient>;
