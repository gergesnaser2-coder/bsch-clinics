# BSCH Clinics — Pre-Production Readiness & Completed Features Report

**Prepared for:** Senior Architect — Final Production Go-Live Review
**Date of audit:** 2026-11-04
**Audited codebase:** `C:\Robo\خاص روبو\bsch-clinics-main\bsch-clinics` (git repository, HEAD `3a657ea` — release tag **1.17V**, clean working tree)
**Method:** Static audit of the committed source, Supabase migrations, production SQL bundles, and verification scripts. **No code, schema, or configuration was changed during this audit.**

---

## 0. Scope & Repository State

- The repository root folder (`bsch-clinics-main/`) contains a **stale snapshot** dated 2026-10-29 (no git history). The authoritative, actively-developed codebase is the nested `bsch-clinics/` git repository (commits `1.10V` → `1.17V`, latest modification 2026-11-04).
- **Action for the Architect:** confirm which tree is deployed; this report documents the `bsch-clinics/` git tree only.
- Stack verified from `package.json`: Next.js **15.4.9** (App Router), React **19.2.1**, TypeScript 5.9.3, Tailwind CSS **4.1.11**, `@supabase/supabase-js` 2.118.0 + `@supabase/ssr` 0.12.7, **Zod 4.6.7**, **React Hook Form 7.91.0** + `@hookform/resolvers` 5.2.1, lucide-react, html-to-image.

---

## 1. Database & Backend (Supabase)

### 1.1 Schema — 14 public tables (plus 1 storage bucket)

| Table | Purpose | Key constraints |
|---|---|---|
| `clinics` | Specialty clinics (outpatient) | PK `id` TEXT; CHECK `max_daily_slots>0`, `slot_duration_minutes>0`; presentation fields (english_title, accent_color, icon_name, display_order, is_featured_on_homepage, is_hospital_confirmed) |
| `staff_profiles` | Staff linked to `auth.users` | PK `id` UUID → `auth.users` CASCADE; UNIQUE `username`; role enum; `clinic_id` FK SET NULL; `is_active` |
| `clinic_schedules` | Per-day closures & capacity overrides | UNIQUE (clinic_id, schedule_date); CHECK capacity ≥ 0 |
| `appointments` | Bookings | UNIQUE `reference_number` `BSCH-####`; CHECK Egyptian phone `^01[0125][0-9]{8}$`, patient name ≥ 5 chars, queue > 0; optional `service_id`, `guardian_national_id`, `booking_code_hash`, `attendance_guidance` |
| `appointment_status_history` | Immutable status flow log | FK CASCADE; no UPDATE/DELETE policies |
| `audit_logs` | Sensitive operations log (JSONB details, IP) | FK `auth.users` SET NULL; immutable |
| `clinic_services` | Per-clinic bookable services | CHECK capacity ≥ 0; `required_documents TEXT[]`, `instructions` |
| `rate_limit_counters` | Persistent rate limiting | PK `key`; service-role only |
| `otp_verifications` | Hashed OTP storage | PK `phone`; service-role only, zero RLS policies |
| `cancellation_requests` | Parent-initiated cancellation workflow | Partial UNIQUE (appointment_id) WHERE status='PENDING'; status CHECK (PENDING/APPROVED/REJECTED) |
| `website_settings` | CMS identity/contact/SEO | PK `id='default'`; public SELECT |
| `homepage_sections` | CMS homepage sections (JSONB content) | PK VARCHAR(50) |
| `navigation_items` | CMS header/footer menus | UNIQUE (location, href) |
| `media_assets` | CMS media registry | storage_path, bucket_id |
| Storage bucket `public-cms-assets` | CMS images | 5 MB limit; SVG blocked (XSS hardening) |

**Enums:** `staff_role` (`ADMIN`, `RECEPTIONIST`, `DOCTOR`), `appointment_status` (`PENDING_REVIEW`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`).

**Key indexes:** partial UNIQUE `(clinic_id, phone_number, appointment_date) WHERE status != 'CANCELLED'` — later superseded by a variant including normalized patient name (allows sibling bookings under one guardian phone); lookups on phone/ref/date+clinic/status/history/audit/services.

### 1.2 Implemented RPC functions (all `SECURITY DEFINER`, `SET search_path = public, pg_temp`)

| Function | Purpose | Execute grants (latest state) |
|---|---|---|
| `book_appointment_atomic(...)` (11-arg) | Atomic booking with advisory lock, capacity, duplicates, working days, schedule overrides; staff → `CONFIRMED`, public → `PENDING_REVIEW`; returns minimized receipt payload | anon, authenticated, service_role |
| `track_appointment_secure(ref, phone)` | **Two-factor tracking** — requires BOTH reference + phone; returns only 8 minimized fields (no address/age/notes/NID) | anon, authenticated, service_role |
| `track_appointments_by_phone(phone)` | Phone-only lookup with masked patient names | anon, authenticated, service_role |
| `update_appointment_status_atomic(...)` | Status transitions with anti-spoofing (forces `auth.uid()`), role checks, terminal-state locks | authenticated, service_role |
| `transfer_appointment_clinic_atomic(...)` | Clinic transfer, ADMIN/RECEPTIONIST only, capacity re-validation | authenticated, service_role |
| `request_cancellation_atomic(...)` | Parent cancellation request (PENDING) | service_role only |
| `review_cancellation_request_atomic(...)` | Staff approve/reject with clinic confinement + audit | authenticated, service_role |
| `check_rate_limit(...)` / `cleanup_expired_rate_limits()` | Persistent rate limiting | service_role only |
| `provision_staff_member(...)` | Staff provisioning (guarded internal) | service_role only |
| `is_active_staff()` / `get_current_staff_role()` / `get_doctor_clinic_id()` | RLS policy helpers | authenticated, service_role |

### 1.3 Row Level Security — CONFIRMED

- RLS is **enabled on all 14 public tables** (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` across migrations).
- Anonymous (`anon`) privileges revoked on `appointments`, `appointment_status_history`, `audit_logs`, `staff_profiles`, `otp_verifications`, `rate_limit_counters`. Anonymous visitors **cannot SELECT appointments directly** — all public reads go through `SECURITY DEFINER` RPCs with data minimization.
- Policy highlights:
  - `clinics` — public SELECT active clinics; ADMIN full management.
  - `appointments` — SELECT/UPDATE restricted to active staff; doctors confined to their assigned clinic; receptionists blocked from `COMPLETED` rows.
  - `appointment_status_history` / `audit_logs` — staff INSERT/SELECT only; **no UPDATE/DELETE policies** (immutable).
  - `cancellation_requests` — no client mutation policies; mutations via RPCs only.
  - `otp_verifications` / `rate_limit_counters` — zero policies, service-role only.
  - CMS tables + storage bucket — public read, ADMIN-only write.

### 1.4 Database hardening (implemented)

- **Anti-escalation trigger** `check_appointment_update_permissions` on `appointments`: reference number immutability, `COMPLETED`/`CANCELLED` terminal-state lock, receptionist cannot complete exams or alter patient identity/clinic/date, doctor clinic confinement (`20261101030000_atomic_status_update_and_privilege_hardening.sql`).
- **Data minimization**: tracking RPCs return only 8 fields; `book_appointment_atomic` returns a sanitized receipt; guardian National ID / booking-code hash never appear in tracking payloads; generic error messages prevent booking enumeration.
- **Service-role mediation** for OTP, rate limiting, cancellation submission, and staff provisioning.
- `updated_at` triggers on 8 tables; advisory lock (`pg_advisory_xact_lock`) for concurrent booking safety.

### 1.5 Deployment artifacts & drift note

- 11 sequential migrations (`supabase/migrations/20261024...–20261101...`) + `seed.sql` + `FIX_BOOKING_RPC.sql` + `SUPABASE_PRODUCTION_BUNDLE_1–4.sql` (bundles 2–4 dated 2026-11-03, bundle 1 + FIX regenerated 2026-11-04) + `SUPABASE_POST_DEPLOYMENT_VERIFICATION.sql` + deployment audit docs.
- **Flagged:** the production bundles diverge from the migrations on several objects (see §6.2). The Architect should reconcile against the live database using `SUPABASE_POST_DEPLOYMENT_VERIFICATION.sql` before go-live.

---

## 2. Frontend Architecture & Pages

### 2.1 App Router pages (completed)

| Route | Type | Description |
|---|---|---|
| `/` | Server | CMS-driven homepage, ISR `revalidate = 60`; renders NoticeBar → SiteHeader → HeroBanner → TrustStatsBar → PrimaryActionCards → ClinicsShowcase → HowItWorks → HospitalBanner → TrustAndInfo → FaqSection → SiteFooter; 3-tier fallback (DB → service defaults → component defaults); `generateMetadata` SEO from CMS |
| `/book` | Server | Redirect `/book?clinic=X` → `/appointments/new?clinic=X` |
| `/appointments/new` | Client | Booking form (Zod + React Hook Form); clinic/service/schedule loading; success ticket view with Print / PNG export / Share / Track actions |
| `/appointments/track` | Client | Phone-first tracking with optional reference unlock; booking list; printable ticket (`#printable-ticket` isolation CSS); cancellation request modal |
| `/staff/login` | Client | Staff login (username/password → Supabase Auth); session persisted to localStorage |
| `/staff/dashboard` | Client | 3,229-line staff SPA: QUEUE, CANCELLATIONS, CLINICS, AUDIT, CMS tabs; role-gated; mobile card layouts |
| `/not-found` | Server | Bilingual 404 card |

### 2.2 API routes (30+)

- **Auth:** `/api/auth/login|logout|session`
- **Public:** `/api/clinics`, `/api/clinics/[id]/schedules`, `/api/clinics/[id]/services`, `/api/slots`, `/api/cms/content`
- **Bookings:** `/api/appointments` (create), `/api/appointments/track`, `/api/appointments/walk-in`, `/api/appointments/cancel-request`, `/api/appointments/[id]/{cancel,recall,status,transfer}`
- **Staff:** `/api/staff/appointments`, `/api/staff/audit-logs`, `/api/staff/cancellation-requests(+[id]/review)`, `/api/staff/clinics(+[id], [id]/schedules)`, `/api/staff/cms/*` (settings, sections, navigation, media, clinics, services)

All staff routes re-verify the session token server-side and enforce role gates (ADMIN for audit/clinics/CMS; ADMIN/RECEPTIONIST for walk-in and cancellation review; doctors confined to their clinic).

### 2.3 Custom UI components

- **Public (11):** `SiteHeader` (sticky glass header, mobile drawer, CMS nav), `NoticeBar` (dismissible 24h-persisted announcement), `HeroBanner`, `TrustStatsBar`, `PrimaryActionCards`, `ClinicsShowcase` (8-clinic grid, per-clinic accents/icons, featured + display_order filtering), `HowItWorks`, `HospitalBanner` (mohp.gov.eg link), `TrustAndInfo` (parent guidelines), `FaqSection` (accessible accordion), `SiteFooter`.
- **Ticket/Receipt views:** embedded success-state receipt in `/appointments/new` and `/appointments/track` (branded header, reference number, status chip, required documents, service instructions, print-isolation CSS, html-to-image PNG export).
- **CMS editors (8):** `CmsDashboard`, `IdentityEditor`, `HomepageEditor`, `NavbarEditor`, `FooterEditor`, `SeoEditor`, `ClinicsPresentationEditor`, `MediaManager`.
- **Hook:** `use-mobile.ts` (matchMedia-based `useIsMobile`; currently not imported anywhere).

---

## 3. Core Business Logic & Features

### 3.1 Booking flow (server action → service → atomic RPC)

`submitBooking` (`app/appointments/new/actions.ts`, `'use server'`) enforces, in order: IP rate limit → **walk-in-only rejection** → name/address/notes length caps → Egyptian phone validation → optional 14-digit guardian NID → 30-day booking horizon → clinic active check → **schedule-override precedence** (closure override beats weekly working days) → service-clinic match. Then `appointmentService.createAppointment` re-validates, counts per-service capacity, and calls `book_appointment_atomic` (advisory lock, duplicate check, monotonic queue number, `BSCH-XXXX` reference generation), with a reconciliation re-query on network failure to avoid false "no booking" results.

### 3.2 "Walk-in Only" prevention logic

- Server-side guard rejects `serviceType === 'WALK_IN_PROCEDURE' | 'EMERGENCY'` with an Arabic message directing the parent to attend in person (`appointments/new/actions.ts:45-51`).
- **Observed:** the booking form currently does not transmit `serviceType`, and the public services API does not filter service types — the guard is implemented as **defense-in-depth**, not an active UI filter today. Staff walk-ins go through `/api/appointments/walk-in` (RECEPTIONIST/ADMIN only, clinic-confined) and are created directly as `CONFIRMED` with a "تسجيل حضوري" note.

### 3.3 Combined Age UI (Year/Month/Day)

- Single field composed of a numeric input + unit select (`سنة` 1–18 / `شهر` 1–36 / `يوم` 0–30), validated by Zod `superRefine` + `validatePatientAge` (`lib/rules.ts:244-270`), stored as a combined string (e.g. `4 سنة`) and shown on the ticket.

### 3.4 Dynamic Clinic Instructions rendering

- Two-level contextual panels in the booking form: **clinic-level** instructions + required documents, and **service-level** instructions + documents, both loaded per selection from `clinics`/`clinic_services`.
- Ticket fallback chain: `appointment.serviceInstructions → activeService.instructions → activeClinic.instructions`, plus required-documents lists, and generic defaults.

### 3.5 Tracking system mechanism

- **Primary UX (current):** phone-number search (`/api/appointments/track`) with IP rate limit (15/10 min), phone rate limit (8/10 min), 300 ms minimum response time, and **privacy masking** — unverified results redact the child's name (`[بيانات الطفل محجوبة لحماية الخصوصية]`), mask the reference (`BSCH-****`), and hide queue numbers.
- **Reference unlock:** entering the matching reference number alongside the phone upgrades the result to verified (full name, queue number).
- **Database RPCs:** `track_appointment_secure(reference, phone)` (strict two-factor) and `track_appointments_by_phone(phone)` (masked names) — both `SECURITY DEFINER` with minimized return tables.
- **Booking code:** a 12-character unambiguous CSPRNG code is generated and stored HMAC-hashed (`booking_code_hash`) for verified bookings (`lib/trackingAccess.ts`).
- **Cancellation workflow:** parent submits ref + phone + reason → `request_cancellation_atomic` (PENDING) → staff approve/reject via `review_cancellation_request_atomic`; a partial UNIQUE index guarantees one pending request per appointment; booking stays active until approved.

### 3.6 Staff workflow features (dashboard)

Queue filters (date/status/clinic/search), metric cards, call/recall with 8-second callout banner, status state machine (`PENDING_REVIEW→CONFIRMED|CANCELLED`, `CONFIRMED→CHECKED_IN|CANCELLED`, `CHECKED_IN→COMPLETED|CANCELLED`; terminal states locked), appointment transfer, quick walk-in creation, cancellation requests review, clinic CRUD + calendar exceptions, audit log viewer, full CMS suite. Server-side enforcement mirrors UI gating in every route.

---

## 4. Security, Validation & State Management

### 4.1 Zod + React Hook Form — CONFIRMED

- The booking form uses **React Hook Form 7** with **`zodResolver`** and a full **Zod 4** schema (`bookingSchema`, `appointments/new/page.tsx:52-97`): min lengths, `.refine()` delegating to `lib/rules.ts` (phone/name/NID), `superRefine` for age bounds, `mode: 'onTouched'`, `noValidate`.
- Server-side re-validation is independent (rules.ts + service layer + SQL CHECK constraints + RPC) — defense in depth; the client schema is never the sole gate.

### 4.2 Next.js Server Actions — CONFIRMED (single, focused)

- `app/appointments/new/actions.ts` (`'use server'`) is the one Server Action and handles the public booking mutation end-to-end (rate limit → business rules → store call → error normalization). All other mutations are API routes that call services which execute `SECURITY DEFINER` RPCs through a validated service-role client (`lib/supabase/admin.ts` — decodes the service key JWT and asserts `role === 'service_role'`; throws in production when missing; falls back to anon/system client only for RLS-mediated paths).

### 4.3 Session & authorization

- Login: Supabase Auth email/password (`username@STAFF_AUTH_DOMAIN`), active-check against `staff_profiles`; HMAC-signed session tokens (`timingSafeEqual` verification, expiry, revocation set) or Supabase JWTs re-verified against the DB on every call; roles never trusted from client input.
- Role gates enforced per route (ADMIN / RECEPTIONIST / DOCTOR with clinic confinement).

### 4.4 Abuse controls & privacy utilities

- Persistent `check_rate_limit` RPC with in-memory degraded fallback (fail-closed in production when Supabase unreachable).
- OTP module (`lib/otp.ts`): CSPRNG 6-digit, HMAC-SHA256 storage, 5-min expiry, 5 attempts, 60 s cooldown, 5 req/hour/phone, 15/10 min IP; dev-only bypass `123456`. **No public API route wires it yet.**
- Cloudflare Turnstile module (`lib/turnstile.ts`): fail-closed in production when the secret is set — **currently not enforced on booking** (see §6).
- Guardian National ID is optional, validated as 14 digits, stored server-side, and **never rendered** on tickets/tracking pages.

### 4.5 Test suite (implemented, not executed in this audit)

- Unit suites via `node --test`: `lib/rules.test.ts`, `lib/security.test.ts` (63 tests: tracking 2FA, doctor isolation, receptionist restrictions, data minimization, terminal-state protection, schedule precedence, walk-in status, rate limits, cancellation audit trail, migration integrity), `lib/otp.test.ts` (10), `lib/persistence.test.ts` (5).
- Integration: `tests/integration/supabase-rls.test.ts` — live-DB RLS assertions (anon blocked from appointments/audit/staff/OTP, can read clinics/CMS, cannot upload or call `provision_staff_member`), opt-in via `TEST_SUPABASE_URL`/`TEST_SUPABASE_ANON_KEY` and refuses production URLs.
- Scripts: `npm test`, `npm run test:integration`. **These were not executed here because `node_modules` is not installed in this workspace — run `npm install && npm test` as part of go-live verification.**

---

## 5. UI/UX & Design System

### 5.1 Strict RTL — CONFIRMED

- `<html lang="ar" dir="rtl">` + Cairo font variable (`app/layout.tsx:48`), `body { direction: rtl }` (`app/globals.css`), redundant per-section `dir="rtl"` wrappers, pervasive `text-right`; Latin fields (phone, NID, reference) are `dir="ltr"` with `font-mono`. Layout uses physical `ml-/mr-` utilities relying on direction flipping (no logical `ms-/me-` properties).
- Font: **Cairo** via `next/font/google`, weights 400–800, subsets arabic+latin, `display: swap`.

### 5.2 Tailwind CSS theming (Deep Teal/Emerald) — CONFIRMED

- Tailwind v4 (`@import "tailwindcss"`). Palette: primary teal **#087F78**, dark teal **#124E4A**, turquoise **#79C7C1**, page background #F6F9FB / #F8FAFC, main text **#163C3A**, secondary text #8493A6 / slate-500, borders #E2E8EE; status chips use emerald/amber/red/blue; secondary sky accent #0284C7; per-clinic accent colors.
- Cards `rounded-[20px]–[32px]`, soft teal-tinted shadows, 44–52 px touch targets, 48 px CTAs, `max-w-[1100px]` container. Light-only (no dark mode). Print styles hide chrome and isolate the ticket (`#printable-ticket`).

### 5.3 Mobile responsiveness — CONFIRMED

- Breakpoints `sm/md/lg`; grids collapse 4→2→1 columns; mobile drawer navigation with 44 px hamburger; booking form single-column on mobile; staff dashboard has dedicated mobile card views with touch action buttons (commit `403d62b "feat(mobile-ux)"`).

### 5.4 Motion

- CSS transitions + Tailwind `animate-ping/pulse/spin` are active. `tw-animate-css` and `motion` are declared but **not imported** — some `animate-in slide-in-*` utility classes on drawers/modals are currently inert (cosmetic only).

---

## 6. Production Go-Live Observations (verified findings — no changes made)

### 6.1 Critical

1. **Fixture credentials reachable in production** — hard-coded staff fixtures (`reception/bsch2026`, `doctor.echo/bsch2026`, `admin/admin2026`) authenticate whenever Supabase is configured, with demo one-click buttons on the login page (`services/authService.ts:19-46,151-175`; `app/staff/login/page.tsx:188-214`). Must be removed or environment-gated before go-live.
2. **Bot protection not active on booking** — `verifyTurnstileToken` is imported but never called by the booking server action; the track/cancel endpoints only verify Turnstile "when the client provides a token"; `TURNSTILE_SECRET_KEY` is absent from `.env`. Commit `77f3138` intentionally removed the booking blocker when the secret is unset.
3. **SQL drift between migrations and production bundles** — `SUPABASE_PRODUCTION_BUNDLE_1.sql`/`FIX_BOOKING_RPC.sql` re-grant `anon` EXECUTE on `book_appointment_atomic`/`track_appointment_secure`, reversing the lockdown of `20261101010000` and contradicting `SUPABASE_POST_DEPLOYMENT_VERIFICATION.sql` Check 6. Bundle1 also declares "tables are currently empty" — the applied state of the live database must be verified before go-live.

### 6.2 High

4. `STAFF_SESSION_SECRET` not set in `.env` → HMAC tokens use the fallback secret `bsch_fallback_secret_key_2026`.
5. Session revocation set is **per-instance memory** (lost on serverless restarts); dashboard relies on a 401 to purge stale tokens client-side.
6. AUDIT tab renders only the last 100 **in-memory** log entries; persisted `audit_logs` rows are written but never read back (`services/appointmentService.ts:347-369`).
7. Ordering dependency: `FIX_BOOKING_RPC.sql` references `attendance_guidance`, which exists only after Bundle 1.
8. Column/object drift between migration path and bundle path: `duration_minutes`, `booking_code_hash`, `guardian_national_id` type/CHECK, `rate_limit_counters.created_at`, reference sequence START (1000 vs 1001), bundle3 review-RPC return-vs-raise semantics.

### 6.3 Medium / hygiene

9. OTP module and `trackingAccess` verification are not wired to any endpoint (booking-code mode is the active path, `TRACKING_ACCESS_MODE` default BOOKING_CODE).
10. Tests were not executed in this workspace (`node_modules` absent) — add `npm install && npm test && npm run test:integration` to the go-live checklist.
11. CMS: `trust_info` section rendered but `patient_guidelines` seeded in defaults (mismatch); footer social links edited but never rendered; placeholder contact data suppressed with "قيد الاعتماد" notices.
12. Unused dependencies/hooks: `motion`, `tw-animate-css` (inert animate classes), `use-mobile` hook, `@google/genai` (no usage found in app/lib/services/components).
13. `eslint.ignoreDuringBuilds: true`; `next/image` remotePatterns allow only `picsum.photos`.

---

## 7. Verdict

The system is **feature-complete** against the requested scope: full schema + RLS + hardened RPCs, all public and staff pages, booking/tracking/cancellation flows, Zod + React Hook Form validation, a Server Action for secure booking, and a cohesive RTL teal design system — with an unusually strong security posture (data minimization, anti-escalation triggers, service-role mediation, 63 security tests, live RLS integration suite). **Go-live should be gated on resolving the three Critical items in §6.1** and executing the database verification script against the production Supabase project.
