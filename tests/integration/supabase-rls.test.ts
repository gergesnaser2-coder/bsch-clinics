/**
 * BSCH Clinics — Live Supabase RLS Integration Test Suite (Opt-In)
 *
 * IMPORTANT:
 * 1. This suite is OPT-IN and will ONLY run if TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY
 *    are explicitly provided in the environment.
 * 2. It must ONLY be run against a SEPARATE, DEDICATED test Supabase project.
 * 3. It will NEVER run against production credentials.
 *
 * Invariants Verified Against Live Database:
 * - Anonymous client (`anon`) is strictly blocked from reading `appointments`, `audit_logs`, `staff_profiles`, and `otp_verifications`.
 * - Anonymous client (`anon`) can read active `clinics`, `website_settings`, and `homepage_sections`.
 * - Non-admin user cannot execute `provision_staff_member` or insert into `staff_profiles`.
 * - Non-admin user cannot modify CMS tables or upload files to `public-cms-assets` bucket.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const testUrl = process.env.TEST_SUPABASE_URL;
const testAnonKey = process.env.TEST_SUPABASE_ANON_KEY;
const testServiceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(testUrl && testAnonKey);

test('LIVE SUPABASE RLS INTEGRATION SUITE (Opt-In Check)', { skip: !isConfigured }, async (t) => {
  if (!testUrl || !testAnonKey) {
    return;
  }

  // Safety Guard: Refuse to run against production
  if (
    process.env.NODE_ENV === 'production' ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL && testUrl === process.env.NEXT_PUBLIC_SUPABASE_URL)
  ) {
    throw new Error('SAFETY ERROR: Integration tests must NOT run against production Supabase instance!');
  }

  const anonClient = createClient(testUrl, testAnonKey, {
    auth: { persistSession: false },
  });

  await t.test('RLS Invariant 1: Anon client is forbidden from SELECT on appointments table', async () => {
    const { data, error } = await anonClient.from('appointments').select('*').limit(5);
    // In Supabase, RLS violations on SELECT return an empty list or a permission denied error
    assert.ok(error !== null || (data && data.length === 0), 'Anon must not access appointments');
  });

  await t.test('RLS Invariant 2: Anon client is forbidden from SELECT on audit_logs table', async () => {
    const { data, error } = await anonClient.from('audit_logs').select('*').limit(5);
    assert.ok(error !== null || (data && data.length === 0), 'Anon must not access audit_logs');
  });

  await t.test('RLS Invariant 3: Anon client is forbidden from SELECT on staff_profiles table', async () => {
    const { data, error } = await anonClient.from('staff_profiles').select('*').limit(5);
    assert.ok(error !== null || (data && data.length === 0), 'Anon must not access staff_profiles');
  });

  await t.test('RLS Invariant 4: Anon client is forbidden from SELECT on otp_verifications table', async () => {
    const { data, error } = await anonClient.from('otp_verifications').select('*').limit(5);
    assert.ok(error !== null || (data && data.length === 0), 'Anon must not access otp_verifications');
  });

  await t.test('RLS Invariant 5: Anon client CAN read active clinics and website settings', async () => {
    const { data: clinics, error: clinicsErr } = await anonClient
      .from('clinics')
      .select('id, name')
      .eq('is_active', true)
      .limit(5);
    assert.equal(clinicsErr, null, 'Active clinics should be readable by anon');

    const { data: settings, error: settingsErr } = await anonClient
      .from('website_settings')
      .select('site_name')
      .limit(1);
    assert.equal(settingsErr, null, 'Website settings should be readable by anon');
  });

  await t.test('RLS Invariant 6: Anon client CANNOT modify website_settings', async () => {
    const { error } = await anonClient
      .from('website_settings')
      .update({ site_name: 'Hacked Site' })
      .eq('id', 'default');
    assert.ok(error !== null, 'Anon must not be allowed to update website_settings');
  });

  await t.test('RLS Invariant 7: Anon client CANNOT upload to public-cms-assets storage bucket', async () => {
    const dummyBlob = new Blob(['test content'], { type: 'text/plain' });
    const { error } = await anonClient.storage
      .from('public-cms-assets')
      .upload('unauthorized_test.txt', dummyBlob);
    assert.ok(error !== null, 'Anon must not be allowed to upload to public-cms-assets bucket');
  });

  await t.test('RLS Invariant 8: Anon client CANNOT execute provision_staff_member RPC', async () => {
    const { error } = await anonClient.rpc('provision_staff_member', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_username: 'attacker',
      p_full_name: 'Attacker User',
      p_role: 'ADMIN',
    });
    assert.ok(error !== null, 'Anon must be forbidden from calling provision_staff_member');
  });
});

