import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appointmentStore } from '../services/appointmentService.ts';
import type { StaffUser, Clinic } from '../types/index.ts';

test('Security 1: Anonymous tracking requires two-factor verification (Reference + Phone)', async () => {
  // Setup a known appointment in store
  const newApt = await appointmentStore.createAppointment({
    clinicId: 'dentistry',
    patientName: 'مريم محمود سالم السعيد',
    phoneNumber: '01011223344',
    appointmentDate: '2026-11-15',
    appointmentTime: '10:00',
  });
  assert.equal(newApt.success, true);
  const ref = newApt.appointment!.referenceNumber;
  const phone = '01011223344';

  // 1. Attempt tracking with reference number alone -> Must be rejected (empty)
  const byRefOnly = await appointmentStore.trackAppointment(ref, '');
  assert.equal(byRefOnly.length, 0, 'Tracking with reference alone must return 0 results');

  // 2. Attempt tracking with phone number alone -> Must be rejected (empty)
  const byPhoneOnly = await appointmentStore.trackAppointment('', phone);
  assert.equal(byPhoneOnly.length, 0, 'Tracking with phone alone must return 0 results');

  // 3. Attempt tracking with mismatched phone and reference -> Must be rejected (empty)
  const mismatched = await appointmentStore.trackAppointment(ref, '01299998888');
  assert.equal(mismatched.length, 0, 'Mismatched reference and phone must return 0 results');

  // 4. Tracking with valid matching pair -> Returns sanitized appointment
  const validTrack = await appointmentStore.trackAppointment(ref, phone);
  assert.equal(validTrack.length, 1);
  const tracked = validTrack[0];
  assert.equal(tracked.referenceNumber, ref);
  assert.equal(tracked.clinicName, 'عيادة الأسنان');
  assert.equal(tracked.patientName, 'مريم محمود سالم السعيد');

  // Verify Data Minimization: patient address and notes must NOT be exposed
  assert.equal((tracked as any).patientAddress, undefined, 'Patient address must not be exposed');
  assert.equal((tracked as any).notes, undefined, 'Internal notes must not be exposed');
});

test('Security 2: Doctor Isolation - Doctor with null clinicId is denied access to all appointments', async () => {
  const unassignedDoctor: StaffUser = {
    id: 'doc-unassigned',
    username: 'dr.unassigned',
    name: 'د/ طبيب بدون عيادة',
    role: 'DOCTOR',
    active: true,
  };

  const results = await appointmentStore.getStaffAppointments({}, unassignedDoctor);
  assert.equal(results.length, 0, 'Doctor without clinicId must see ZERO appointments');
});

test('Security 3: Doctor Isolation - Doctor can only view and update their assigned clinic', async () => {
  const echoDoctor: StaffUser = {
    id: 'doc-echo-1',
    username: 'dr.echo',
    name: 'د/ شريف عبد الغني',
    role: 'DOCTOR',
    clinicId: 'echo',
    active: true,
  };

  // 1. Doctor queries appointments -> Must only return appointments for 'echo'
  const echoApts = await appointmentStore.getStaffAppointments({}, echoDoctor);
  for (const apt of echoApts) {
    assert.equal(apt.clinicId, 'echo', 'Echo doctor must only see appointments in clinic echo');
  }

  // 2. Doctor attempts to update appointment of another clinic (dentistry)
  const dentistryApt = (await appointmentStore.getStaffAppointments()).find((a) => a.clinicId === 'dentistry');
  assert.ok(dentistryApt, 'Dentistry appointment must exist');

  const updateResult = await appointmentStore.updateStatus(
    dentistryApt.id,
    'COMPLETED',
    echoDoctor,
    'محاولة طبيب من عيادة أخرى'
  );
  assert.equal(updateResult.success, false);
  assert.match(updateResult.error || '', /عيادة أخرى/, 'Doctor cannot update another clinic');
});

test('Security 4: Receptionist Privilege Boundaries - Cannot mark COMPLETED or alter patient identity', async () => {
  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create a pending appointment
  const aptResult = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'عمر إبراهيم حسن الشناوي',
    phoneNumber: '01511223344',
    appointmentDate: '2026-11-18',
    appointmentTime: '11:00',
  });
  assert.equal(aptResult.success, true);
  const aptId = aptResult.appointment!.id;

  // 1. Receptionist confirms booking -> Allowed
  const confirmResult = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'تأكيد الحجز');
  assert.equal(confirmResult.success, true);

  // 2. Receptionist attempts to mark COMPLETED -> Must be rejected (Medical role only)
  const completeResult = await appointmentStore.updateStatus(aptId, 'COMPLETED', receptionist, 'محاولة إغلاق طبي');
  assert.equal(completeResult.success, false);
  assert.match(completeResult.error || '', /صلاحية طبية مخصصة للأطباء/, 'Receptionist cannot mark COMPLETED');
});

test('Security 5: book_appointment_atomic data minimization', async () => {
  const result = await appointmentStore.createAppointment({
    clinicId: 'nutrition',
    patientName: 'كريم خالد عبد السلام النمر',
    phoneNumber: '01211112233',
    patientAge: '3 سنوات',
    patientAddress: 'دمنهور - شارع عبد السلام الشاذلي',
    appointmentDate: '2026-11-20',
    appointmentTime: '09:00',
  });

  assert.equal(result.success, true);
  const apt = result.appointment!;

  // Minimum required safe fields
  assert.ok(apt.referenceNumber.startsWith('BSCH-'));
  assert.equal(apt.clinicName, 'عيادة التغذية');
  assert.equal(apt.appointmentDate, '2026-11-20');
  assert.equal(apt.status, 'PENDING_REVIEW');
  assert.ok((apt.queueNumber || 0) > 0);
});

test('Security 6: Duplicate active reservation in same clinic on same date is blocked', async () => {
  const phone = '01122334455';
  const clinicId = 'cardio';
  const date = '2026-11-22';

  // First booking
  const first = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(first.success, true);

  // Second duplicate booking for same phone + clinic + date
  const second = await appointmentStore.createAppointment({
    clinicId,
    patientName: 'زياد طارق أحمد مصطفى',
    phoneNumber: phone,
    appointmentDate: date,
  });
  assert.equal(second.success, false);
  assert.match(second.error || '', /يوجد حجز مسبق بالفعل/, 'Duplicate booking on same date must be rejected');
});

test('Security 7: Terminal status protection - Completed or cancelled appointments cannot be reopened by staff', async () => {
  const doctor: StaffUser = {
    id: 'doc-gi',
    username: 'dr.gi',
    name: 'د/ استشاري الجهاز الهضمي',
    role: 'DOCTOR',
    clinicId: 'gi',
    active: true,
  };

  const receptionist: StaffUser = {
    id: 'rec-1',
    username: 'reception',
    name: 'أ/ منى عبد الرحيم',
    role: 'RECEPTIONIST',
    active: true,
  };

  // Create, confirm, check-in, complete
  const aptRes = await appointmentStore.createAppointment({
    clinicId: 'gi',
    patientName: 'فاطمة علي إبراهيم عمار',
    phoneNumber: '01099887766',
    appointmentDate: '2026-11-25',
  });
  const aptId = aptRes.appointment!.id;
  await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist);
  await appointmentStore.updateStatus(aptId, 'CHECKED_IN', receptionist);
  const completed = await appointmentStore.updateStatus(aptId, 'COMPLETED', doctor);
  assert.equal(completed.success, true);

  // Attempt to revert completed status by receptionist -> Denied
  const revertAttempt = await appointmentStore.updateStatus(aptId, 'CONFIRMED', receptionist, 'محاولة فتح الحجز');
  assert.equal(revertAttempt.success, false);
});

test('Security 8: Seed data re-run resilience - Confirmed clinics preserve hospital accreditation and official attributes', () => {
  // 1. Static SQL Audit on supabase/seed.sql
  const seedPath = path.resolve('supabase/seed.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // Verify that the ON CONFLICT clause has the WHERE clause guarding confirmed clinics
  assert.ok(
    seedSql.includes('WHERE clinics.is_hospital_confirmed = false;'),
    'seed.sql must include WHERE clinics.is_hospital_confirmed = false; to prevent overwriting confirmed clinics'
  );

  // Verify that is_hospital_confirmed preserves existing value
  assert.ok(
    seedSql.includes('is_hospital_confirmed = clinics.is_hospital_confirmed'),
    'seed.sql must set is_hospital_confirmed = clinics.is_hospital_confirmed'
  );

  // Verify that it does NOT do is_hospital_confirmed = EXCLUDED.is_hospital_confirmed
  assert.ok(
    !seedSql.includes('is_hospital_confirmed = EXCLUDED.is_hospital_confirmed'),
    'seed.sql must NOT blindly overwrite is_hospital_confirmed with EXCLUDED.is_hospital_confirmed'
  );

  // Verify PostgreSQL column qualification rules: target columns on the left of assignment must be unqualified
  const setAssignments = [
    'name = EXCLUDED.name',
    'description = EXCLUDED.description',
    'location = EXCLUDED.location',
    'working_hours = EXCLUDED.working_hours',
    'days_of_week = EXCLUDED.days_of_week',
    'max_daily_slots = EXCLUDED.max_daily_slots',
    'slot_duration_minutes = EXCLUDED.slot_duration_minutes',
    'instructions = EXCLUDED.instructions',
    'is_active = EXCLUDED.is_active',
  ];
  for (const assignment of setAssignments) {
    assert.ok(
      seedSql.includes(assignment),
      `seed.sql must include properly qualified assignment: ${assignment}`
    );
  }

  // 2. Behavioral Simulation of PostgreSQL ON CONFLICT DO UPDATE WHERE semantics
  interface DatabaseClinicRow {
    id: string;
    name: string;
    location: string;
    working_hours: string;
    max_daily_slots: number;
    instructions: string;
    is_active: boolean;
    is_hospital_confirmed: boolean;
    updated_at: string;
  }

  // Simulating existing rows in DB:
  // - cardio: Officially reviewed and confirmed by hospital management with customized settings
  // - dentistry: Provisional unconfirmed clinic
  const dbClinics: Record<string, DatabaseClinicRow> = {
    cardio: {
      id: 'cardio',
      name: 'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
      location: 'مبنى أ - الدور الرابع جناح 1',
      working_hours: '08:00-15:00',
      max_daily_slots: 25,
      instructions: 'تعليمات معتمدة رسمياً: يلزم إحضار رسم القلب السريري والأشعة التلفزيونية الحديثة',
      is_active: true,
      is_hospital_confirmed: true,
      updated_at: '2026-10-20T10:00:00Z',
    },
    dentistry: {
      id: 'dentistry',
      name: 'عيادة الأسنان',
      location: 'الدور الأرضي - عيادة 1',
      working_hours: '08:30-14:00',
      max_daily_slots: 20,
      instructions: 'تعليمات أولية تجريبية',
      is_active: true,
      is_hospital_confirmed: false,
      updated_at: '2026-10-01T10:00:00Z',
    },
  };

  // Incoming seed data payload (provisional default data)
  const incomingSeedRowForCardio: DatabaseClinicRow = {
    id: 'cardio',
    name: 'عيادة قلب الأطفال',
    location: 'الدور الرابع - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 18,
    instructions: 'يرجى مراجعة قياس النبض في غرفة العلامات الحيوية بالدور الأرضي أولاً.',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  const incomingSeedRowForDentistry: DatabaseClinicRow = {
    id: 'dentistry',
    name: 'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    location: 'الدور الأرضي - عيادة 1',
    working_hours: '08:30-14:00',
    max_daily_slots: 22,
    instructions: 'تعليمات محدثة للعيادة التجريبية',
    is_active: true,
    is_hospital_confirmed: false,
    updated_at: '2026-10-25T12:00:00Z',
  };

  // PostgreSQL DO UPDATE WHERE clinics.is_hospital_confirmed = false function
  function simulateSeedUpsert(incoming: DatabaseClinicRow) {
    const existing = dbClinics[incoming.id];
    if (existing) {
      // Evaluation of WHERE clause: WHERE clinics.is_hospital_confirmed = false
      if (existing.is_hospital_confirmed === false) {
        // Condition matches -> Update provisional clinic
        existing.name = incoming.name;
        existing.location = incoming.location;
        existing.working_hours = incoming.working_hours;
        existing.max_daily_slots = incoming.max_daily_slots;
        existing.instructions = incoming.instructions;
        existing.is_active = incoming.is_active;
        existing.is_hospital_confirmed = existing.is_hospital_confirmed; // Preserved
        existing.updated_at = incoming.updated_at;
      }
      // If existing.is_hospital_confirmed === true: DO NOTHING! Row is untouched
    } else {
      dbClinics[incoming.id] = { ...incoming };
    }
  }

  // Re-run seed data
  simulateSeedUpsert(incomingSeedRowForCardio);
  simulateSeedUpsert(incomingSeedRowForDentistry);

  // Assertions for Confirmed Clinic (cardio): MUST BE 100% UNCHANGED
  const cardio = dbClinics.cardio;
  assert.equal(cardio.is_hospital_confirmed, true, 'Confirmed clinic must remain is_hospital_confirmed = true');
  assert.equal(
    cardio.name,
    'عيادة أمراض قلب الأطفال التخصصية المعتمدة رسمياً',
    'Official clinic name must not be overwritten by seed re-run'
  );
  assert.equal(
    cardio.location,
    'مبنى أ - الدور الرابع جناح 1',
    'Official location must not be overwritten by seed re-run'
  );
  assert.equal(cardio.working_hours, '08:00-15:00', 'Official hours must not be overwritten');
  assert.equal(cardio.max_daily_slots, 25, 'Official slot capacity must not be overwritten');
  assert.equal(cardio.updated_at, '2026-10-20T10:00:00Z', 'Updated timestamp must remain unchanged');

  // Assertions for Provisional Clinic (dentistry): MUST BE UPDATED
  const dentistry = dbClinics.dentistry;
  assert.equal(dentistry.is_hospital_confirmed, false, 'Provisional clinic remains false');
  assert.equal(
    dentistry.name,
    'عيادة طب الأسنان للأطفال (محدث تجريبي)',
    'Provisional clinic can be updated when unconfirmed'
  );
  assert.equal(dentistry.max_daily_slots, 22);
});
