import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types.ts';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-service-role-key';

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(
    url &&
    !url.includes('placeholder') &&
    anonKey &&
    !anonKey.includes('placeholder')
  );
}

/**
 * Validates if Supabase server-side service-role key is provided for administrative writes.
 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
    !url.includes('placeholder') &&
    serviceKey &&
    !serviceKey.includes('placeholder')
  );
}

/**
 * Determines whether in-memory mock fallback operations are permitted.
 * Rules:
 * 1. If Supabase is configured, all operations MUST target Supabase; mock fallback is FORBIDDEN.
 * 2. In production (NODE_ENV === 'production'), mock fallback is STRICTLY FORBIDDEN.
 * 3. In development/testing, mock fallback is only allowed when Supabase is explicitly unconfigured.
 */
export function isMockStoreAllowed(): boolean {
  if (isSupabaseConfigured()) {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}
