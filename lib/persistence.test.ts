import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentStore } from '../services/appointmentService.ts';
import { cmsService } from '../services/cmsService.ts';
import type { StaffUser } from '../types/index.ts';

const adminUser: StaffUser = {
  id: 'admin-test',
  username: 'admin',
  name: 'مدير النظام التجريبي',
  role: 'ADMIN',
  active: true,
};

test('Persistence Test 1: Booking failure in Supabase NEVER returns a false success ticket', async () => {
  // Set environment to simulate configured Supabase
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-for-test';

    // Calling createAppointment when Supabase write fails must reject cleanly
    const result = await appointmentStore.createAppointment({
      clinicId: 'dentistry',
      patientName: 'كريم أحمد محمد يوسف',
      phoneNumber: '01012345678',
      patientAge: '5 سنوات',
      patientAddress: 'دمنهور - البحيرة',
      appointmentDate: '2026-11-20',
    });

    assert.equal(result.success, false, 'createAppointment must return success=false on DB failure');
    assert.equal(result.appointment, undefined, 'No appointment ticket may be issued when persistence fails');
    assert.ok(result.error && result.error.length > 0, 'Must provide clear Arabic error message to user');
    assert.match(result.error!, /قاعدة البيانات|تعذر/, 'Error must indicate persistence/connection failure');
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test('Persistence Test 2: direct createAppointment rejects without falling back to memory when DB fails', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-for-test';

    const result = await appointmentStore.createAppointment({
      clinicId: 'echo',
      patientName: 'سارة إبراهيم علي مصطفى',
      phoneNumber: '01122334455',
      appointmentDate: '2026-11-21',
    });

    assert.equal(result.success, false, 'createAppointment must return false when Supabase fails');
    assert.equal(result.appointment, undefined, 'Must not return an unpersisted appointment object');
    assert.ok(result.error, 'Must provide error description');
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test('Persistence Test 3: CMS updateSettings failure NEVER modifies cache or returns success', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const initialContent = await cmsService.getPublishedContent();
  const initialSiteName = initialContent.settings.site_name;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-for-test';

    const result = await cmsService.updateSettings(
      { site_name: 'اسم مزيف لم يحفظ في الداتابيز' },
      adminUser
    );

    assert.equal(result.success, false, 'CMS updateSettings must return false when DB write fails');
    assert.ok(result.error, 'Error message must be returned');
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }

  // In-memory cache must NOT have been corrupted with unpersisted value
  const afterContent = await cmsService.getPublishedContent();
  assert.equal(
    afterContent.settings.site_name,
    initialSiteName,
    'Settings in cache must remain untouched when DB write fails'
  );
});

test('Persistence Test 4: CMS updateSection failure NEVER modifies cache or returns success', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const initialContent = await cmsService.getPublishedContent();
  const heroSection = initialContent.sections.find((s) => s.id === 'hero');
  const initialHeroTitle = heroSection ? heroSection.title : '';

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-for-test';

    const result = await cmsService.updateSection(
      'hero',
      { title: 'عنوان قسم غير محفوظ' },
      adminUser
    );

    assert.equal(result.success, false, 'updateSection must return false when DB write fails');
    assert.ok(result.error);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }

  const afterContent = await cmsService.getPublishedContent();
  const afterHero = afterContent.sections.find((s) => s.id === 'hero');
  assert.equal(afterHero?.title, initialHeroTitle, 'Section title must not change in memory upon DB failure');
});

test('Persistence Test 5: Production mode strictly forbids in-memory fallback when Supabase is unconfigured', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Booking attempt in production without Supabase
    const bookingResult = await appointmentStore.createAppointment({
      clinicId: 'gi',
      patientName: 'عمر طارق إبراهيم حسن',
      phoneNumber: '01234567890',
      appointmentDate: '2026-11-25',
    });
    assert.equal(bookingResult.success, false, 'Production without Supabase must reject booking');
    assert.match(bookingResult.error || '', /إنتاج|قاعدة البيانات/);

    // CMS save attempt in production without Supabase
    const cmsResult = await cmsService.updateSettings({ emergency_hotline: '999' }, adminUser);
    assert.equal(cmsResult.success, false, 'Production without Supabase must reject CMS save');
    assert.match(cmsResult.error || '', /إنتاج|قاعدة البيانات/);
  } finally {
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});
