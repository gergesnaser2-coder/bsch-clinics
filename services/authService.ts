import { StaffUser } from '../types';

export interface AuthSession {
  user: StaffUser;
  token: string;
  expiresAt: number;
}

const STAFF_USERS: (StaffUser & { passwordHash: string })[] = [
  {
    id: 'user-rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم (موظف الحجز والاستقبال)',
    role: 'RECEPTIONIST',
    passwordHash: 'bsch2026',
    active: true,
  },
  {
    id: 'user-doc-1',
    username: 'doctor.echo',
    name: 'د/ شريف عبد الغني (استشاري قلب وإيكو الأطفال)',
    role: 'DOCTOR',
    clinicId: 'echo',
    passwordHash: 'bsch2026',
    active: true,
  },
  {
    id: 'user-admin-1',
    username: 'admin',
    name: 'إدارة نظم المعلومات والعيادات الخارجية',
    role: 'ADMIN',
    passwordHash: 'admin2026',
    active: true,
  },
];

// Active sessions memory map attached to globalThis for Next.js cross-route sharing
const globalForAuth = globalThis as unknown as {
  activeSessions?: Map<string, AuthSession>;
};

const activeSessions = globalForAuth.activeSessions ?? new Map<string, AuthSession>();
if (process.env.NODE_ENV !== 'production') {
  globalForAuth.activeSessions = activeSessions;
}

export class AuthService {
  public static validateCredentials(username: string, password: string): StaffUser | null {
    if (!username || !password) return null;
    const cleanUser = username.trim().toLowerCase();
    const user = STAFF_USERS.find(
      (u) => u.username.toLowerCase() === cleanUser && u.active
    );
    if (!user) return null;
    if (user.passwordHash !== password) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  public static createSession(user: StaffUser): AuthSession {
    const token = `bsch_token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const session: AuthSession = {
      user,
      token,
      expiresAt: Date.now() + 1000 * 60 * 60 * 8, // 8 hours
    };
    activeSessions.set(token, session);
    return session;
  }

  public static verifySession(token: string | null | undefined): StaffUser | null {
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      activeSessions.delete(token);
      return null;
    }
    return session.user;
  }

  public static revokeSession(token: string): boolean {
    return activeSessions.delete(token);
  }
}
