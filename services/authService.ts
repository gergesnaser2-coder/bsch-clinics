import type { StaffUser } from '../types/index.ts';
import { createClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
  isMockStoreAllowed,
} from '../lib/supabase/admin.ts';
import {
  getStaffSessionSecret,
  issueStaffToken,
  verifyStaffToken,
  STAFF_SESSION_TTL_MS,
} from '../lib/auth/token.ts';

export interface AuthSession {
  user: StaffUser;
  token: string;
  expiresAt: number;
  supabaseEmail?: string;
}

// Offline dev / unit-test accounts. Empty by default; tests may seed their own
// users via _setMockUsersForTesting. No production credentials ever live here.
export interface MockStaffUser {
  id: string;
  username: string;
  name: string;
  role: StaffUser['role'];
  clinicId?: string | null;
  password: string;
  active: boolean;
}

// In-memory sessions map strictly for offline unit tests / development
const globalForAuth = globalThis as unknown as {
  activeSessions?: Map<string, AuthSession>;
  revokedStaffTokens?: Set<string>;
};

const memoryActiveSessions = globalForAuth.activeSessions ?? new Map<string, AuthSession>();
const revokedStaffTokens = globalForAuth.revokedStaffTokens ?? new Set<string>();
if (process.env.NODE_ENV !== 'production') {
  globalForAuth.activeSessions = memoryActiveSessions;
  globalForAuth.revokedStaffTokens = revokedStaffTokens;
}

function buildStaffUser(profile: {
  id: string;
  username: string;
  full_name: string;
  role: string;
  clinic_id?: string | null;
  is_active: boolean;
}): StaffUser {
  return {
    id: profile.id,
    username: profile.username,
    name: profile.full_name,
    role: profile.role as StaffUser['role'],
    clinicId:
      profile.clinic_id ||
      (profile.role === 'RECEPTIONIST' ? 'general' : undefined),
    active: profile.is_active,
  };
}

export class AuthService {
  private static mockUsers: MockStaffUser[] = [];

  /** Test/dev-only seeding for the offline mock path. */
  public static _setMockUsersForTesting(users: MockStaffUser[]): void {
    AuthService.mockUsers = users.map((u) => ({ ...u }));
  }

  /**
   * Validate staff credentials using Supabase Auth (signInWithPassword) only.
   * On success issues an HMAC-signed staff session token (httpOnly cookie on the login route).
   */
  public static async validateCredentials(
    usernameInput: string,
    passwordInput: string
  ): Promise<AuthSession | null> {
    if (!usernameInput || !passwordInput) return null;
    const cleanUser = usernameInput.trim();
    const cleanPass = passwordInput.trim();

    // 1. Supabase Auth Path (the ONLY production path)
    if (isSupabaseConfigured()) {
      // Fail closed: staff sessions cannot be issued without the signing secret.
      const secret = getStaffSessionSecret();

      try {
        let authClient: any = null;
        if (isSupabaseAdminConfigured()) {
          try {
            authClient = createAdminClient();
          } catch {
            authClient = null;
          }
        }
        if (!authClient) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
          const supabaseAnonKey =
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            '';
          authClient = createClient(supabaseUrl, supabaseAnonKey);
        }

        const staffDomain = process.env.STAFF_AUTH_DOMAIN || 'hospital.internal';
        const email = cleanUser.includes('@') ? cleanUser : `${cleanUser.toLowerCase()}@${staffDomain}`;

        const { data, error } = await authClient.auth.signInWithPassword({
          email,
          password: cleanPass,
        });

        if (!error && data?.user && data?.session) {
          // Map auth.users record to verified public.staff_profiles
          let profile = null;
          if (isSupabaseAdminConfigured()) {
            try {
              const adminClient = createAdminClient();
              const { data: adminProf, error: profileErr } = await (adminClient as any)
                .from('staff_profiles')
                .select('id, username, full_name, role, clinic_id, is_active')
                .eq('id', data.user.id)
                .maybeSingle();

              if (!profileErr && adminProf) {
                profile = adminProf;
              }
            } catch {
              profile = null;
            }
          }

          if (!profile && data.session?.access_token) {
            // Fallback to verified authenticated user client under RLS
            const userClient = createUserClient(data.session.access_token);
            const { data: userProf } = await (userClient as any)
              .from('staff_profiles')
              .select('id, username, full_name, role, clinic_id, is_active')
              .eq('id', data.user.id)
              .maybeSingle();
            profile = userProf;
          }

          if (profile && profile.is_active === true) {
            const safeUser = buildStaffUser(profile);

            const token = await issueStaffToken(
              {
                sub: safeUser.id,
                username: safeUser.username,
                name: safeUser.name,
                role: safeUser.role,
                clinicId: safeUser.clinicId || null,
                exp: Date.now() + STAFF_SESSION_TTL_MS,
              },
              secret
            );

            return {
              user: safeUser,
              token,
              expiresAt: Date.now() + STAFF_SESSION_TTL_MS,
              supabaseEmail: email,
            };
          }
        }

        return null;
      } catch (err) {
        console.error('Supabase signInWithPassword exception:', err);
        return null;
      }
    }

    // 2. Production safety check: In-memory authentication is strictly forbidden in production
    if (!isMockStoreAllowed()) {
      throw new Error('تسجيل الدخول غير متاح: قاعدة بيانات المصادقة غير مهيأة في بيئة الإنتاج.');
    }

    // 3. Offline Dev / Unit Test Fallback (seeded per-test, no built-in credentials)
    const user = AuthService.mockUsers.find(
      (u) => u.username.toLowerCase() === cleanUser.toLowerCase() && u.active
    );
    if (!user) return null;
    if (user.password !== cleanPass) return null;

    const safeUser: StaffUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId || undefined,
      active: user.active,
    };
    const token = `bsch_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const session: AuthSession = {
      user: safeUser,
      token,
      expiresAt: Date.now() + STAFF_SESSION_TTL_MS,
    };
    memoryActiveSessions.set(token, session);
    return session;
  }

  /**
   * Verify an authentication token.
   * Never trusts client-supplied roles: HMAC tokens are re-checked against
   * staff_profiles whenever the admin client is available.
   */
  public static async verifySession(token: string | null | undefined): Promise<StaffUser | null> {
    if (!token) return null;
    const cleanToken = token.trim();

    // 0. Verified Staff Token Verification (HMAC-SHA256 signed)
    if (cleanToken.startsWith('bsch_staff_')) {
      if (revokedStaffTokens.has(cleanToken)) return null;
      try {
        const secret = getStaffSessionSecret();
        const claims = await verifyStaffToken(cleanToken, secret);
        if (!claims || claims.exp <= Date.now()) return null;

        // Live re-validation against staff_profiles (role/active changes take effect immediately)
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data: profile, error: profileErr } = await (adminClient as any)
              .from('staff_profiles')
              .select('id, username, full_name, role, clinic_id, is_active')
              .eq('id', claims.sub)
              .maybeSingle();

            if (!profileErr && profile && profile.is_active === true) {
              return buildStaffUser(profile);
            }
            if (!profileErr && (!profile || profile.is_active !== true)) {
              return null; // Fail closed: missing or inactive staff profile
            }
          } catch {
            // DB unreachable: fall back to the signed claims (issued from a verified profile)
          }
        }

        return {
          id: claims.sub,
          username: claims.username,
          name: claims.name,
          role: claims.role as StaffUser['role'],
          clinicId: claims.clinicId || undefined,
          active: true,
        };
      } catch (err) {
        console.error('Error verifying bsch_staff token:', err);
        return null;
      }
    }

    // 1. Supabase Auth Verification
    if (isSupabaseConfigured()) {
      try {
        let userRecord = null;
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data, error } = await adminClient.auth.getUser(cleanToken);
            if (!error && data?.user) {
              userRecord = data.user;
            }
          } catch {
            userRecord = null;
          }
        }
        if (!userRecord) {
          try {
            const userClient = createUserClient(cleanToken);
            const { data, error } = await userClient.auth.getUser();
            if (error || !data?.user) {
              return null;
            }
            userRecord = data.user;
          } catch {
            return null;
          }
        }

        // Query server-enforced role and clinic assignment from staff_profiles
        let profile = null;
        if (isSupabaseAdminConfigured()) {
          try {
            const adminClient = createAdminClient();
            const { data: adminProf, error: adminErr } = await (adminClient as any)
              .from('staff_profiles')
              .select('id, username, full_name, role, clinic_id, is_active')
              .eq('id', userRecord.id)
              .maybeSingle();

            if (!adminErr && adminProf) {
              profile = adminProf;
            }
          } catch {
            profile = null;
          }
        }

        if (!profile) {
          const userClient = createUserClient(cleanToken);
          const { data: userProf } = await (userClient as any)
            .from('staff_profiles')
            .select('id, username, full_name, role, clinic_id, is_active')
            .eq('id', userRecord.id)
            .maybeSingle();
          profile = userProf;
        }

        if (!profile || profile.is_active !== true) {
          return null; // Fail closed: reject inactive or missing staff profile
        }

        return buildStaffUser(profile);
      } catch (err) {
        console.error('Supabase verifySession exception:', err);
        return null;
      }
    }

    // 2. Production Safety: In-memory verification forbidden in production
    if (!isMockStoreAllowed()) {
      return null;
    }

    // 3. Offline Dev / Unit Test Fallback
    const session = memoryActiveSessions.get(cleanToken);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      memoryActiveSessions.delete(cleanToken);
      return null;
    }
    return session.user;
  }

  /**
   * Revoke an active session.
   */
  public static async revokeSession(token: string): Promise<boolean> {
    if (!token) return false;
    const cleanToken = token.trim();

    if (cleanToken.startsWith('bsch_staff_')) {
      revokedStaffTokens.add(cleanToken);
      memoryActiveSessions.delete(cleanToken);
      return true;
    }

    if (isSupabaseConfigured()) {
      try {
        const adminClient = createAdminClient();
        await adminClient.auth.admin.signOut(cleanToken).catch(() => {});
        return true;
      } catch {
        return false;
      }
    }

    return memoryActiveSessions.delete(cleanToken);
  }

  /**
   * Helper for offline test teardowns
   */
  public static _resetMockSessionsForTesting(): void {
    memoryActiveSessions.clear();
    revokedStaffTokens.clear();
    AuthService.mockUsers = [];
  }
}
