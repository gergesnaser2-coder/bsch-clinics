# BSCH Clinics — API Authentication & Authorization Matrix

This document provides a comprehensive security review and inventory of **every API route handler** in the BSCH Clinics codebase under the `app/api` directory.

Total route handlers inspected: **25 routes**.

---

## 1. Complete API Route Matrix

| # | Route | Method | Auth Required | Roles Allowed | Uses Service Role | Rate-Limited | Touches Patient Data | Security Notes |
|---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | `/api/appointments` | POST | ❌ No | Public | Yes | ✅ **Yes (IP Rate-Limited + DB Partial Index)** | 🚨 **YES (FLAGGED)** | Public booking. Validates Egyptian phone, name length, address length, notes length, clinic operating days, and service-clinic match. |
| 2 | `/api/appointments/track` | GET, POST | ⚠️ Verified Access | Public (Booking Code / OTP SMS) | Yes | ✅ **Yes (IP + Cooldown + Hourly Window)** | 🚨 **YES (FLAGGED)** | Unified access challenge (Default: Booking Code hash check; Alternative: OTP SMS). Strips Guardian National ID, notes, and booking codes. Uniform error response & timing. |
| 3 | `/api/appointments/walk-in` | POST | ✅ Yes | `ADMIN`, `RECEPTIONIST` | Yes | ❌ No | 🚨 **YES** | Registers walk-in ticket. Doctors are strictly forbidden (403). |
| 4 | `/api/appointments/[id]/cancel` | POST | ❌ No | Public / Patient | Yes | ❌ No | 🚨 **YES (FLAGGED)** | Patient cancellation by ID/reference. Can transition pending/confirmed appointment to CANCELLED. |
| 5 | `/api/appointments/[id]/recall` | POST | ✅ Yes | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | Yes | ❌ No | 🚨 **YES** | Increments queue call count. Doctors isolated to their assigned clinic. |
| 6 | `/api/appointments/[id]/status` | POST | ✅ Yes | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | Yes | ❌ No | 🚨 **YES** | Status transition. Receptionist cannot mark `COMPLETED`. Doctors isolated to assigned clinic. |
| 7 | `/api/appointments/[id]/transfer` | POST | ✅ Yes | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | Yes | ❌ No | 🚨 **YES** | Clinic transfer. Checks capacity & operating days of target clinic. |
| 8 | `/api/auth/login` | POST | ❌ No | Public Credentials | Yes | ❌ No | ❌ No | Validates credentials via Supabase Auth + `staff_profiles`. Returns token and sanitized profile. |
| 9 | `/api/auth/logout` | POST | ⚠️ Optional | Authenticated Staff | Yes | ❌ No | ❌ No | Signs out session and revokes token in Supabase Auth. |
| 10 | `/api/auth/session` | GET | ✅ Yes | Any Active Staff | Yes | ❌ No | ❌ No | Verifies bearer token via Supabase Auth + `staff_profiles`. Returns safe user info. |
| 11 | `/api/clinics` | GET | ❌ No | Public | ❌ No (Anon) | ❌ No | ❌ No | Public clinics catalog, working hours, and instructions. |
| 12 | `/api/clinics/[id]/services` | GET | ❌ No | Public | ❌ No (Anon) | ❌ No | ❌ No | Public clinic services catalog (returns `is_active = true` services only). |
| 13 | `/api/cms/content` | GET | ❌ No | Public | ❌ No (Anon) | ❌ No | ❌ No | Public CMS data (revalidated every 60s). |
| 14 | `/api/slots` | GET | ❌ No | Public | Yes | ❌ No | ❌ No | Returns aggregated available slot counts for date/clinic without exposing patient identities. |
| 15 | `/api/staff/appointments` | GET | ✅ Yes | `ADMIN`, `RECEPTIONIST`, `DOCTOR` | Yes | ❌ No | 🚨 **YES** | Internal appointments list. Server-side clinic isolation enforced for Doctors. |
| 16 | `/api/staff/audit-logs` | GET | ✅ Yes | `ADMIN` only | Yes | ❌ No | ⚠️ Indirect | Administrative audit log viewer. Receptionist & Doctor return 403 Forbidden. |
| 17 | `/api/staff/clinics` | GET, POST | ✅ Yes | GET: All Staff; POST: `ADMIN` | Yes | ❌ No | ❌ No | Manages clinic definitions and operational capacity. |
| 18 | `/api/staff/clinics/[id]` | GET, PATCH | ✅ Yes | GET: All Staff; PATCH: `ADMIN` | Yes | ❌ No | ❌ No | Updates clinic capacity, active status, instructions. |
| 19 | `/api/staff/cms` | GET | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Returns full draft & published CMS content bundle. |
| 20 | `/api/staff/cms/clinics/[id]` | PATCH | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Updates clinic presentation attributes (colors, icons, instructions). |
| 21 | `/api/staff/cms/clinics/[id]/services` | GET, POST, PATCH | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Manages clinical specialized services per clinic. Non-admin receives 403 Forbidden. |
| 22 | `/api/staff/cms/media` | GET, POST, DELETE | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Uploads, inspects, and deletes assets in `public-cms-assets` bucket. |
| 23 | `/api/staff/cms/navigation` | GET, POST, PATCH, DELETE | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Manages header & footer navigation menu items. |
| 24 | `/api/staff/cms/sections` | GET, PATCH | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Manages homepage sections (Hero, Guidelines, FAQ). |
| 25 | `/api/staff/cms/settings` | GET, PATCH | ✅ Yes | `ADMIN` only | Yes | ❌ No | ❌ No | Manages global website identity, address, SEO, notice bar. |

---

## 2. Security Findings on Unauthenticated Patient-Facing Routes

### Route 1: `POST /api/appointments` & Server Action `submitBooking` (Patient Booking)
- **Status:** Unauthenticated by design (hospital requirement: "الحجز بدون إنشاء حساب").
- **Risks:** Potential automated spam reservations.
- **Current Mitigations:**
  1. IP Rate Limiting: Verified via `checkIpRateLimit` before processing.
  2. Strict Egyptian mobile number regex: `^01[0125][0-9]{8}$`.
  3. Strict input length caps: Name (5–150 chars, min 2 words), Address (max 250 chars), Notes (max 500 chars).
  4. Operating Days validation: Server-side check that appointment date matches clinic operating days and is not a weekend/holiday.
  5. Service-Clinic match: Verifies `serviceId` belongs to `clinicId` and is active.
  6. Database constraint: Maximum daily capacity per clinic.
  7. Unique Partial Index in database: Prevents the same phone number from creating more than one active appointment in the same clinic on the same calendar day.
- **CAPTCHA Status:** Currently **NO CAPTCHA** is enabled on the booking form. Rate limiting and unique database constraints provide defense.
- **Recommendation for Post-Launch:** Introduce Cloudflare Turnstile or Google reCAPTCHA v3 on the frontend booking form to block automated headless scrapers if abuse is detected.

### Route 2: `POST /api/appointments/[id]/cancel` (Patient Cancellation)
- **Status:** Unauthenticated by ID/reference number.
- **Risks:** If an attacker discovers or guesses a valid appointment ID/reference, they could cancel another patient's appointment.
- **Recommendation:** Require phone number confirmation or OTP/Booking-code verification before allowing cancellation via this endpoint, matching the secure tracking flow.

### Route 3: `POST /api/appointments/track` (Patient Tracking)
- **Status:** Secured via Booking Code hash challenge (default) or OTP challenge.
- **Mitigations:**
  1. Plain phone enumeration is eliminated: Constant-time comparison is executed even for unknown phone numbers to prevent timing attacks.
  2. Rate limiting: IP rate limiting (15 requests/10 min) and phone cooldown (60s) / hourly cap (5/hour).
  3. Single-exposure invariant: Full 12-char booking code is shown only once on confirmation screen / printed card / PDF / PNG.
  4. Data Sanitization: Responses exclude Guardian National ID, clinical internal notes, and booking codes.
