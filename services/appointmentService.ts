import type { Clinic, Appointment, AppointmentSlot, AppointmentStatus, CreateAppointmentInput, AuditLogItem, StaffUser } from '../types/index.ts';
import { normalizeAndValidateEgyptianPhone, validatePatientName, generateReferenceNumber, canTransitionStatus, formatLocalDate } from '../lib/rules.ts';
import { createAdminClient, isSupabaseConfigured, isMockStoreAllowed } from '../lib/supabase/admin.ts';
import type { Database } from '../types/database.types.ts';

// Pre-defined pediatric outpatient clinics from BSCH
// Note: Marked as isHospitalConfirmed = false until verified by hospital administration
const INITIAL_CLINICS: Clinic[] = [
  {
    id: 'dentistry',
    name: 'عيادة الأسنان',
    description: 'فحص وعلاج أسنان الأطفال، حشو وقائي، علاج العصب وتقويم الأسنان المبكر',
    location: 'الدور الأرضي - عيادة 1',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6], // Sat to Thu
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار بطاقة التأمين الصحي وشهادة ميلاد الطفل. يُنصح بتناول وجبة خفيفة قبل الحضور بنصف ساعة وتنظيف الأسنان جيداً بالفرشاة والمعجون. يرجى تجنب إعطاء الطفل مسكنات قوية قبل موعد الكشف مباشرة.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'echo',
    name: 'عيادة الإيكو',
    description: 'فحص الموجات فوق الصوتية على قلب الأطفال والكشف المبكر عن عيوب القلب الخلقية',
    location: 'أمام عيادة القلب بالدور الرابع',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'يلزم إحضار تقرير الطبيب المعالج، وفحوصات الموجات الصوتية السابقة على القلب. يُفضل أن يكون الطفل في حالة شبع وهدوء أو وقت قيلولة لضمان دقة وسرعة تصوير عضلة وصمامات القلب بالموجات فوق الصوتية.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'nutrition',
    name: 'عيادة التغذية',
    description: 'متابعة النمو، حساسية الطعام، سوء التغذية، وسمنة ونحافة الأطفال',
    location: 'الدور الثالث - عيادة 3',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار بطاقة التطعيمات ودفتر متابعة نمو الطفل منذ الولادة. يُفضل تدوين جدول غذائي مفصل بما تناوله الطفل خلال الـ 3 أيام الماضية، مع إحضار تحاليل صورة الدم الشاملة ومستوى الحديد والكالسيوم وفيتامين د إن وُجدت.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'gi',
    name: 'عيادة الجهاز الهضمي',
    description: 'علاج اضطرابات الهضم، حساسية القمح، الارتجاع والتهابات المعدة والأمعاء',
    location: 'الدور الثاني - عيادة 6',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'إحضار التحاليل المعملية السابقة (وظائف كبد، حساسية القمح، صورة دم)، وأشعة السونار على البطن والحوض. يُفضل صيام الطفل ساعتين قبل الكشف لإمكانية إجراء الفحص السريري الدقيق للبطن والجهاز الهضمي.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'audiology',
    name: 'عيادة السمعيات',
    description: 'قياس السمع لحديثي الولادة والأطفال، فحص ضغط الأذن والتأهيل السمعي',
    location: 'الدور الأرضي - عيادة 4',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'يشترط لإجراء فحص السمع الدقيق وضغط الأذن أن تكون أذن الطفل نظيفة وخالية من الشمع أو الالتهابات الحادة، وأن يكون الرضيع أو الطفل في حالة نوم عميق أو هدوء تام أثناء إجراء اختبار استجابة جذع المخ (ABR).',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'neuro',
    name: 'عيادة النفسية والعصبية',
    description: 'متابعة التشنجات والصرع، تأخر التطور الحركي، فرط الحركة وتشتت الانتباه',
    location: 'الدور الرابع - عيادة 2',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 15,
    slotDurationMinutes: 30,
    instructions: 'إحضار أصل رسم المخ الكهربائي (EEG)، أو أشعة الرنين المغناطيسي (MRI)، أو الأشعة المقطعية الحديثة. يُرجى تدوين مواعيد وجرعات أدوية التشنجات والصرع، وتوثيق نوبات التشنج بمقطع فيديو بالهاتف إن أمكن.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'cardio',
    name: 'عيادة قلب الأطفال',
    description: 'تشخيص ومتابعة أمراض صمامات القلب والعيوب الخلقية وضغط الدم',
    location: 'الدور الرابع - عيادة 1',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 18,
    slotDurationMinutes: 30,
    instructions: 'يرجى مراجعة غرفة العلامات الحيوية لقياس النبض وضغط الدم أولاً. يلزم إحضار رسم القلب (ECG)، أو تقارير الإيكو وأشعة الصدر السابقة إن وُجدت، مع قائمة بجميع أدوية القلب التي يتناولها الطفل بانتظام.',
    isActive: true,
    isHospitalConfirmed: false,
  },
  {
    id: 'surgery',
    name: 'عيادة جراحة الأطفال',
    description: 'مناظرة حالات الفتق، الخصية المعلقة، التشوهات الخلقية، وجراحات البطن',
    location: 'الدور الثاني - عيادة 2',
    workingHours: '08:30-14:00',
    daysOfWeek: [0, 1, 2, 3, 4, 6],
    maxDailySlots: 20,
    slotDurationMinutes: 30,
    instructions: 'الحضور صائماً لمدة لا تقل عن 4 إلى 6 ساعات للحالات التي تقرر لها فحص أو تدخل جراحي مجدول. يلزم إحضار التحاليل المعملية (صورة دم كاملة CBC، زمن النزف والتجلط PT/PC)، وتقارير أشعة السونار الخاصة بالحالة.',
    isActive: true,
    isHospitalConfirmed: false,
  },
];

function getTodayDateString(): string {
  return formatLocalDate();
}

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-1',
    referenceNumber: 'BSCH-1042',
    clinicId: 'echo',
    clinicName: 'عيادة الإيكو',
    patientName: 'أحمد محمود إبراهيم النجار',
    phoneNumber: '01012345678',
    patientAge: '4 سنوات',
    patientAddress: 'دمنهور - شبرا',
    appointmentDate: getTodayDateString(),
    appointmentTime: '09:00',
    status: 'CONFIRMED',
    queueNumber: 3,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        note: 'تم استلام طلب الحجز عبر البوابة الإلكترونية',
      },
      {
        status: 'CONFIRMED',
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        note: 'تمت مراجعة الطلب وتأكيد الحجز برقم دور 3',
        updatedBy: 'موظف الاستقبال',
      },
    ],
  },
  {
    id: 'apt-2',
    referenceNumber: 'BSCH-2849',
    clinicId: 'dentistry',
    clinicName: 'عيادة الأسنان',
    patientName: 'سارة محمد أحمد الخولي',
    phoneNumber: '01198765432',
    patientAge: '6 سنوات',
    patientAddress: 'كفر الدوار',
    appointmentDate: getTodayDateString(),
    appointmentTime: '09:30',
    status: 'PENDING_REVIEW',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        note: 'طلب حجز جديد بانتظار مراجعة موظف الاستقبال',
      },
    ],
  },
  {
    id: 'apt-3',
    referenceNumber: 'BSCH-3915',
    clinicId: 'gi',
    clinicName: 'عيادة الجهاز الهضمي',
    patientName: 'يوسف كريم عادل الشريف',
    phoneNumber: '01255554444',
    patientAge: '2 سنة',
    patientAddress: 'إيتاي البارود',
    appointmentDate: getTodayDateString(),
    appointmentTime: '08:30',
    status: 'CHECKED_IN',
    queueNumber: 1,
    lastCalledAt: new Date(Date.now() - 120000).toISOString(),
    calledCount: 1,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 120000).toISOString(),
    statusHistory: [
      {
        status: 'PENDING_REVIEW',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
      {
        status: 'CONFIRMED',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        updatedBy: 'موظف الاستقبال',
      },
      {
        status: 'CHECKED_IN',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        note: 'حضر المريض وتم تسجيل الدخول ونداء الدور 1',
        updatedBy: 'موظف الاستقبال',
      },
    ],
  },
];

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    staffName: 'أ/ منى عبد الرحيم (موظف الحجز)',
    staffRole: 'RECEPTIONIST',
    action: 'تأكيد حجز',
    details: 'تم تأكيد حجز المريض أحمد محمود بالعيادة مع منح الدور #3',
    referenceNumber: 'BSCH-1042',
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    staffName: 'أ/ منى عبد الرحيم (موظف الحجز)',
    staffRole: 'RECEPTIONIST',
    action: 'تسجيل حضور ونداء',
    details: 'تسجيل حضور المريض يوسف كريم واستدعائه لشاشة الانتظار بالدور #1',
    referenceNumber: 'BSCH-3915',
  },
];

class AppointmentServiceStore {
  private clinics: Clinic[] = [...INITIAL_CLINICS];
  private appointments: Appointment[] = [...INITIAL_APPOINTMENTS];
  private auditLogs: AuditLogItem[] = [...INITIAL_AUDIT_LOGS];

  public addAuditLog(staffName: string, staffRole: string, action: string, details: string, referenceNumber?: string) {
    const item: AuditLogItem = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      staffName,
      staffRole,
      action,
      details,
      referenceNumber,
    };
    this.auditLogs.unshift(item);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        supabase.from('audit_logs').insert({
          action,
          entity_type: referenceNumber ? 'APPOINTMENT' : 'CLINIC',
          entity_id: referenceNumber || 'SYSTEM',
          details: {
            staffName,
            staffRole,
            description: details,
            referenceNumber,
          },
        }).then();
      } catch (err) {
        console.warn('Supabase audit log insert error:', err);
      }
    }
  }

  public getAuditLogs(): AuditLogItem[] {
    return this.auditLogs.slice(0, 100);
  }

  public async getAllClinics(): Promise<Clinic[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from('clinics')
          .select('*')
          .eq('is_active', true);
        if (!error && data && data.length > 0) {
          const rows = data as unknown as Database['public']['Tables']['clinics']['Row'][];
          return rows.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || undefined,
            location: c.location,
            workingHours: c.working_hours,
            daysOfWeek: c.days_of_week,
            maxDailySlots: c.max_daily_slots,
            slotDurationMinutes: c.slot_duration_minutes,
            instructions: c.instructions || undefined,
            isActive: c.is_active,
            isHospitalConfirmed: c.is_hospital_confirmed,
          }));
        }
      } catch (err) {
        console.warn('Supabase fetch clinics fallback to local store:', err);
      }
    }
    return this.clinics.filter((c) => c.isActive);
  }

  public getAllClinicsIncludingInactive(): Clinic[] {
    return this.clinics;
  }

  public getClinicById(id: string): Clinic | undefined {
    return this.clinics.find((c) => c.id === id);
  }

  public async updateClinic(
    clinicId: string,
    updates: Partial<Clinic>,
    staffUser: StaffUser
  ): Promise<{ success: boolean; clinic?: Clinic; error?: string }> {
    if (staffUser.role !== 'ADMIN') {
      return { success: false, error: 'تعديل بيانات العيادات يتطلب صلاحية مدير النظام' };
    }
    const clinic = this.getClinicById(clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة غير موجودة' };
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from('clinics')
          .update({
            name: updates.name !== undefined ? updates.name : clinic.name,
            location: updates.location !== undefined ? updates.location : clinic.location,
            working_hours: updates.workingHours !== undefined ? updates.workingHours : clinic.workingHours,
            max_daily_slots: updates.maxDailySlots !== undefined ? updates.maxDailySlots : clinic.maxDailySlots,
            is_active: updates.isActive !== undefined ? updates.isActive : clinic.isActive,
            is_hospital_confirmed: updates.isHospitalConfirmed !== undefined ? updates.isHospitalConfirmed : (clinic.isHospitalConfirmed ?? false),
            instructions: updates.instructions !== undefined ? updates.instructions : clinic.instructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clinicId);

        if (error) {
          console.error('Supabase update clinic failed with code:', error.code);
          return {
            success: false,
            error: 'فشل في حفظ تعديلات العيادة في قاعدة البيانات المركزية. يرجى المحاولة لاحقاً.',
          };
        }
      } catch (err: any) {
        console.error('Supabase update clinic exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث العيادة. يرجى التحقق من الشبكة.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة إدارة العيادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    // Apply updates locally only after DB confirmation (or in permitted mock mode)
    if (updates.name !== undefined) clinic.name = updates.name;
    if (updates.location !== undefined) clinic.location = updates.location;
    if (updates.workingHours !== undefined) clinic.workingHours = updates.workingHours;
    if (updates.maxDailySlots !== undefined) clinic.maxDailySlots = updates.maxDailySlots;
    if (updates.isActive !== undefined) clinic.isActive = updates.isActive;
    if (updates.instructions !== undefined) clinic.instructions = updates.instructions;
    if (updates.isHospitalConfirmed !== undefined) clinic.isHospitalConfirmed = updates.isHospitalConfirmed;

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'تعديل إعدادات العيادة',
      `تم تحديث إعدادات ${clinic.name}: الحالة ${clinic.isActive ? 'مفعلة' : 'متوقفة'}، السعة ${clinic.maxDailySlots}، الاعتماد: ${clinic.isHospitalConfirmed ? 'معتمد' : 'تجريبي'}`
    );

    return { success: true, clinic };
  }

  public getAvailableSlots(clinicId: string, dateStr: string): AppointmentSlot[] {
    const clinic = this.getClinicById(clinicId);
    if (!clinic) return [];

    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    if (!clinic.daysOfWeek.includes(dayOfWeek)) {
      return []; // Clinic closed on this day
    }

    const slotTimes = [
      '08:30', '09:00', '09:30', '10:00', '10:30',
      '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'
    ];

    const dayBookings = this.appointments.filter(
      (a) => a.clinicId === clinicId && a.appointmentDate === dateStr && a.status !== 'CANCELLED'
    );

    const slotCapacity = 3;

    return slotTimes.map((time) => {
      const bookedInSlot = dayBookings.filter((a) => a.appointmentTime === time).length;
      return {
        id: `${clinicId}-${dateStr}-${time}`,
        clinicId,
        date: dateStr,
        time,
        capacity: slotCapacity,
        bookedCount: bookedInSlot,
        isAvailable: bookedInSlot < slotCapacity,
      };
    });
  }

  public async createAppointment(input: CreateAppointmentInput): Promise<{
    success: boolean;
    appointment?: Appointment;
    error?: string;
  }> {
    const phoneCheck = normalizeAndValidateEgyptianPhone(input.phoneNumber);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error || 'رقم هاتف غير صالح' };
    }

    const nameCheck = validatePatientName(input.patientName);
    if (!nameCheck.isValid) {
      return { success: false, error: nameCheck.error || 'اسم المريض غير صالح' };
    }

    const clinic = this.getClinicById(input.clinicId);
    if (!clinic) {
      return { success: false, error: 'العيادة المختارة غير موجودة أو غير مفعلة' };
    }

    if (!input.appointmentDate) {
      return { success: false, error: 'تاريخ الموعد مطلوب' };
    }

    const todayStr = getTodayDateString();
    if (input.appointmentDate < todayStr) {
      return { success: false, error: 'لا يمكن حجز موعد في تاريخ سابق' };
    }

    const slots = this.getAvailableSlots(input.clinicId, input.appointmentDate);
    let selectedTime = input.appointmentTime;

    if (selectedTime) {
      const targetSlot = slots.find((s) => s.time === selectedTime);
      if (targetSlot && !targetSlot.isAvailable) {
        return { success: false, error: 'الموعد المحدد ممتلئ، يرجى اختيار موعد آخر' };
      }
    } else {
      const firstAvailable = slots.find((s) => s.isAvailable);
      selectedTime = firstAvailable ? firstAvailable.time : '09:00';
    }

    let ref = generateReferenceNumber();
    while (this.appointments.some((a) => a.referenceNumber === ref)) {
      ref = generateReferenceNumber();
    }

    // Attempt Supabase atomic function if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any).rpc('book_appointment_atomic', {
          p_clinic_id: input.clinicId,
          p_patient_name: input.patientName.trim(),
          p_phone_number: phoneCheck.normalized,
          p_patient_age: input.patientAge?.trim() || null,
          p_patient_address: input.patientAddress?.trim() || null,
          p_appointment_date: input.appointmentDate,
          p_appointment_time: selectedTime || '09:00',
          p_reference_number: ref,
        });

        if (error) {
          console.error('Supabase atomic booking RPC error code:', error.code);
          return {
            success: false,
            error: error.message?.includes('duplicate') || error.message?.includes('مسبق')
              ? 'يوجد حجز مسبق بالفعل لنفس الهاتف في هذه العيادة في نفس اليوم'
              : 'فشل في تسجيل الحجز في قاعدة البيانات المركزية، يرجى المحاولة لاحقاً.',
          };
        }

        if (data && typeof data === 'object') {
          const res = data as { success: boolean; error?: string; appointment?: any };
          if (!res.success) {
            return { success: false, error: res.error || 'فشل تسجيل الحجز في قاعدة البيانات' };
          }
          if (res.appointment) {
            const dbApt = res.appointment;
            const mappedApt: Appointment = {
              id: dbApt.id || dbApt.reference_number || `apt-${Date.now()}`,
              referenceNumber: dbApt.reference_number,
              clinicId: dbApt.clinic_id,
              clinicName: dbApt.clinic_name,
              patientName: dbApt.patient_name,
              phoneNumber: dbApt.phone_number,
              patientAge: dbApt.patient_age || undefined,
              patientAddress: dbApt.patient_address || undefined,
              appointmentDate: dbApt.appointment_date,
              appointmentTime: dbApt.appointment_time,
              status: dbApt.status,
              queueNumber: dbApt.queue_number,
              createdAt: dbApt.created_at || new Date().toISOString(),
              updatedAt: dbApt.updated_at || new Date().toISOString(),
              statusHistory: [
                {
                  status: dbApt.status,
                  timestamp: new Date().toISOString(),
                  note: input.isWalkIn
                    ? 'تسجيل حضوري مباشر من مكتب الاستقبال بالمستشفى'
                    : 'تم استلام وتأكيد طلب الحجز بنجاح في قاعدة البيانات المركزية',
                },
              ],
            };
            this.appointments.unshift(mappedApt);
            return { success: true, appointment: mappedApt };
          }
        }

        return {
          success: false,
          error: 'استجابة غير متوقعة من قاعدة البيانات المركزية، يرجى التحقق من حالة الحجز.',
        };
      } catch (err: any) {
        console.error('Supabase booking exception:', err?.message || 'Network exception');

        // Requirement 8: Reconciliation check before failing
        // In case of a network timeout where write may have succeeded, check if ref exists
        try {
          const supabase = createAdminClient();
          const { data: existingApt } = await supabase
            .from('appointments')
            .select('*')
            .eq('reference_number', ref)
            .maybeSingle();

          if (existingApt) {
            const mappedApt: Appointment = {
              id: (existingApt as any).id,
              referenceNumber: (existingApt as any).reference_number,
              clinicId: (existingApt as any).clinic_id,
              clinicName: (existingApt as any).clinic_name,
              patientName: (existingApt as any).patient_name,
              phoneNumber: (existingApt as any).phone_number,
              patientAge: (existingApt as any).patient_age || undefined,
              patientAddress: (existingApt as any).patient_address || undefined,
              appointmentDate: (existingApt as any).appointment_date,
              appointmentTime: (existingApt as any).appointment_time,
              status: (existingApt as any).status,
              queueNumber: (existingApt as any).queue_number,
              createdAt: (existingApt as any).created_at,
              updatedAt: (existingApt as any).updated_at,
              statusHistory: [],
            };
            this.appointments.unshift(mappedApt);
            return { success: true, appointment: mappedApt };
          }
        } catch {
          // Ignore secondary reconciliation error
        }

        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات المركزية لتسجيل الحجز. لم يتم تأكيد الحجز، يرجى إعادة المحاولة.',
        };
      }
    }

    // Fallback: strictly checked by isMockStoreAllowed()
    if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة الحجز الإلكتروني غير متصلة بقاعدة البيانات المركزية في بيئة الإنتاج.',
      };
    }

    // Local memory transaction check fallback
    const existing = this.appointments.find(
      (a) =>
        a.phoneNumber === phoneCheck.normalized &&
        a.clinicId === input.clinicId &&
        a.appointmentDate === input.appointmentDate &&
        a.status !== 'CANCELLED'
    );
    if (existing) {
      return {
        success: false,
        error: `يوجد حجز مسبق بالفعل لهذا الرقم في ${clinic.name} بنفس التاريخ برقم مرجعي (${existing.referenceNumber})`,
      };
    }

    const dayBookingsCount = this.appointments.filter(
      (a) => a.clinicId === input.clinicId && a.appointmentDate === input.appointmentDate && a.status !== 'CANCELLED'
    ).length;
    const queueNumber = dayBookingsCount + 1;

    const now = new Date().toISOString();
    const initialStatus: AppointmentStatus = input.isWalkIn ? 'CONFIRMED' : 'PENDING_REVIEW';

    const newAppointment: Appointment = {
      id: `apt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      referenceNumber: ref,
      clinicId: clinic.id,
      clinicName: clinic.name,
      patientName: input.patientName.trim(),
      phoneNumber: phoneCheck.normalized,
      patientAge: input.patientAge?.trim() || undefined,
      patientAddress: input.patientAddress?.trim() || undefined,
      appointmentDate: input.appointmentDate,
      appointmentTime: selectedTime || '09:00',
      status: initialStatus,
      queueNumber,
      createdAt: now,
      updatedAt: now,
      statusHistory: [
        {
          status: initialStatus,
          timestamp: now,
          note: input.isWalkIn
            ? 'حجز حضوري مباشر من مكتب الاستقبال بالمستشفى'
            : 'تم إرسال طلب الحجز بنجاح عبر بوابة المواعيد الإلكترونية',
        },
      ],
    };

    this.appointments.unshift(newAppointment);

    if (input.isWalkIn) {
      this.addAuditLog(
        'الاستقبال والحجز',
        'RECEPTIONIST',
        'حجز حضوري سريع',
        `تسجيل مريض حضوري (${newAppointment.patientName}) في ${clinic.name} دور #${queueNumber}`,
        ref
      );
    }

    return { success: true, appointment: newAppointment };
  }

  public async trackAppointment(
    referenceNumber: string,
    phoneNumber: string
  ): Promise<Appointment[]> {
    if (!referenceNumber || !phoneNumber) return [];
    let cleanRef = referenceNumber.trim().toUpperCase();
    if (/^[0-9]{4,6}$/.test(cleanRef)) {
      cleanRef = `BSCH-${cleanRef}`;
    }

    const phoneCheck = normalizeAndValidateEgyptianPhone(phoneNumber);
    if (!phoneCheck.isValid) return [];
    const cleanPhone = phoneCheck.normalized;

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await (supabase as any).rpc('track_appointment_secure', {
          p_reference_number: cleanRef,
          p_phone_number: cleanPhone,
        });
        if (!error && data && Array.isArray(data) && data.length > 0) {
          return data.map((dbApt: any) => ({
            id: dbApt.reference_number,
            referenceNumber: dbApt.reference_number,
            clinicId: dbApt.clinic_id,
            clinicName: dbApt.clinic_name,
            patientName: dbApt.patient_name,
            phoneNumber: cleanPhone,
            appointmentDate: dbApt.appointment_date,
            appointmentTime: dbApt.appointment_time,
            status: dbApt.status,
            queueNumber: dbApt.queue_number,
            createdAt: '',
            updatedAt: '',
            statusHistory: [],
          }));
        }
      } catch (err) {
        console.warn('Supabase trackAppointment error:', err);
      }
    }

    // In-memory fallback: strictly check BOTH referenceNumber and phoneNumber
    return this.appointments.filter(
      (a) =>
        a.referenceNumber.toUpperCase() === cleanRef &&
        a.phoneNumber === cleanPhone
    );
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return this.appointments.find((a) => a.id === id);
  }

  public async updateStatus(
    id: string,
    targetStatus: AppointmentStatus,
    updatedByOrUser: string | StaffUser,
    note?: string
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const apt = this.getAppointmentById(id);
    if (!apt) {
      return { success: false, error: 'الموعد غير موجود' };
    }

    const staffUser: StaffUser | null = typeof updatedByOrUser === 'object' ? updatedByOrUser : null;
    const staffName: string = typeof updatedByOrUser === 'string' ? updatedByOrUser : updatedByOrUser.name;

    // Role-based privilege checks
    if (staffUser) {
      if (staffUser.role === 'RECEPTIONIST') {
        if (targetStatus === 'COMPLETED') {
          return { success: false, error: 'إتمام الكشف الطبي وصرف التذكرة صلاحية طبية مخصصة للأطباء فقط' };
        }
      } else if (staffUser.role === 'DOCTOR') {
        if (!staffUser.clinicId) {
          return { success: false, error: 'غير مصرح للطبيب غير المعين على عيادة بتعديل المواعيد' };
        }
        if (apt.clinicId !== staffUser.clinicId) {
          return { success: false, error: 'غير مصرح للطبيب بتعديل مواعيد خاصة بعيادة أخرى' };
        }
      }
    }

    // Terminal state protection
    if (apt.status === 'COMPLETED' && (!staffUser || staffUser.role !== 'ADMIN')) {
      return { success: false, error: 'لا يمكن تعديل حجز تم الكشف عليه واكتماله مسبقاً إلا بواسطة مدير النظام' };
    }
    if (apt.status === 'CANCELLED' && (!staffUser || staffUser.role !== 'ADMIN')) {
      return { success: false, error: 'لا يمكن إعادة فتح حجز ملغي مسبقاً' };
    }

    if (!canTransitionStatus(apt.status, targetStatus)) {
      return {
        success: false,
        error: `لا يمكن تحويل حالة الحجز من "${apt.status}" إلى "${targetStatus}"`,
      };
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error: aptError } = await supabase
          .from('appointments')
          .update({
            status: targetStatus,
            last_called_at: targetStatus === 'CHECKED_IN' ? now : apt.lastCalledAt || null,
            called_count: targetStatus === 'CHECKED_IN' ? (apt.calledCount || 0) + 1 : (apt.calledCount || 0),
            updated_at: now,
          })
          .eq('reference_number', apt.referenceNumber);

        if (aptError) {
          console.error('Supabase status update error code:', aptError.code);
          return {
            success: false,
            error: 'فشل في تحديث حالة الحجز في قاعدة البيانات المركزية. يرجى إعادة المحاولة.',
          };
        }

        const { error: histError } = await supabase.from('appointment_status_history').insert({
          appointment_id: apt.id,
          status: targetStatus,
          note: note || undefined,
          updated_by: staffName,
        });

        if (histError) {
          console.warn('Supabase status history insert warning code:', histError.code);
        }
      } catch (err: any) {
        console.error('Supabase status update exception:', err?.message || 'Network error');
        return {
          success: false,
          error: 'تعذر الاتصال بقاعدة البيانات لتحديث حالة الحجز.',
        };
      }
    } else if (!isMockStoreAllowed()) {
      return {
        success: false,
        error: 'خدمة تعديل الحالات غير متصلة بقاعدة البيانات في بيئة الإنتاج.',
      };
    }

    // Apply status change in local memory store only after database confirms (or in permitted mock mode)
    apt.status = targetStatus;
    apt.updatedAt = now;

    if (targetStatus === 'CHECKED_IN') {
      apt.lastCalledAt = now;
      apt.calledCount = (apt.calledCount || 0) + 1;
    }

    apt.statusHistory.push({
      status: targetStatus,
      timestamp: now,
      note: note || undefined,
      updatedBy: staffName,
    });

    this.addAuditLog(
      staffName,
      staffUser?.role || 'STAFF',
      `تحديث الحالة إلى ${targetStatus}`,
      note || `تم تغيير حالة الحجز للمريض ${apt.patientName}`,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async recallPatient(id: string, staffUser: StaffUser): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const apt = this.getAppointmentById(id);
    if (!apt) {
      return { success: false, error: 'الحجز غير موجود' };
    }
    if (apt.status !== 'CHECKED_IN' && apt.status !== 'CONFIRMED') {
      return { success: false, error: 'يمكن نداء أو إعادة نداء المرضى في حالة "مؤكد" أو "حضر المريض" فقط' };
    }

    const now = new Date().toISOString();
    const newCalledCount = (apt.calledCount || 0) + 1;

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'CHECKED_IN',
            last_called_at: now,
            called_count: newCalledCount,
            updated_at: now,
          })
          .eq('reference_number', apt.referenceNumber);

        if (error) {
          console.error('Supabase recallPatient failed code:', error.code);
          return { success: false, error: 'فشل تسجيل نداء المريض في قاعدة البيانات المركزية.' };
        }

        await supabase.from('appointment_status_history').insert({
          appointment_id: apt.id,
          status: 'CHECKED_IN',
          note: newCalledCount > 1 ? `إعادة نداء المريض للمرة #${newCalledCount}` : 'نداء المريض وتسجيل الحضور بالعيادة',
          updated_by: staffUser.name,
        });
      } catch (err: any) {
        console.error('Supabase recallPatient exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لتسجيل النداء.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة نداء المرضى غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    apt.status = 'CHECKED_IN';
    apt.lastCalledAt = now;
    apt.calledCount = newCalledCount;
    apt.updatedAt = now;

    apt.statusHistory.push({
      status: 'CHECKED_IN',
      timestamp: now,
      note: newCalledCount > 1 ? `إعادة نداء المريض للمرة #${newCalledCount}` : 'نداء المريض وتسجيل الحضور بالعيادة',
      updatedBy: staffUser.name,
    });

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'إعادة نداء المريض',
      `إعادة نداء مريض (${apt.clinicName}) للمرة #${apt.calledCount}`,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async transferClinic(
    id: string,
    targetClinicId: string,
    reason: string,
    staffUser: StaffUser
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> {
    const apt = this.getAppointmentById(id);
    if (!apt) {
      return { success: false, error: 'الحجز غير موجود' };
    }

    const targetClinic = this.getClinicById(targetClinicId);
    if (!targetClinic) {
      return { success: false, error: 'العيادة المحول إليها غير متوفرة' };
    }

    if (apt.clinicId === targetClinicId) {
      return { success: false, error: 'المريض مسجل بالفعل في هذه العيادة' };
    }

    const oldClinicName = apt.clinicName;

    // Calculate next queue number in target clinic
    const targetDayCount = this.appointments.filter(
      (a) => a.clinicId === targetClinicId && a.appointmentDate === apt.appointmentDate && a.status !== 'CANCELLED'
    ).length;
    const newQueue = targetDayCount + 1;
    const now = new Date().toISOString();
    const transferNote = `تم التحويل من [${oldClinicName}] إلى [${targetClinic.name}] برقم دور جديد (#${newQueue}). السبب: ${reason || 'تحويل طبي داخلي'}`;

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from('appointments')
          .update({
            clinic_id: targetClinic.id,
            clinic_name: targetClinic.name,
            queue_number: newQueue,
            status: 'CONFIRMED',
            updated_at: now,
          })
          .eq('reference_number', apt.referenceNumber);

        if (error) {
          console.error('Supabase transferClinic failed code:', error.code);
          return { success: false, error: 'فشل تحويل الحجز في قاعدة البيانات المركزية.' };
        }

        await supabase.from('appointment_status_history').insert({
          appointment_id: apt.id,
          status: 'CONFIRMED',
          note: transferNote,
          updated_by: staffUser.name,
        });
      } catch (err: any) {
        console.error('Supabase transferClinic exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لتحويل الحجز.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة تحويل العيادات غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    apt.clinicId = targetClinic.id;
    apt.clinicName = targetClinic.name;
    apt.queueNumber = newQueue;
    apt.status = 'CONFIRMED';
    apt.updatedAt = now;

    apt.statusHistory.push({
      status: 'CONFIRMED',
      timestamp: now,
      note: transferNote,
      updatedBy: staffUser.name,
    });

    this.addAuditLog(
      staffUser.name,
      staffUser.role,
      'تحويل بين العيادات',
      transferNote,
      apt.referenceNumber
    );

    return { success: true, appointment: apt };
  }

  public async cancelAppointment(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const apt = this.getAppointmentById(id);
    if (!apt) {
      return { success: false, error: 'الموعد غير موجود' };
    }
    if (apt.status === 'COMPLETED' || apt.status === 'CANCELLED') {
      return { success: false, error: 'لا يمكن إلغاء حجز مكتمل أو ملغي مسبقاً' };
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from('appointments')
          .update({ status: 'CANCELLED', updated_at: now })
          .eq('reference_number', apt.referenceNumber);

        if (error) {
          console.error('Supabase cancel failed code:', error.code);
          return { success: false, error: 'فشل إلغاء الحجز في قاعدة البيانات المركزية.' };
        }

        await supabase.from('appointment_status_history').insert({
          appointment_id: apt.id,
          status: 'CANCELLED',
          note: reason ? `تم الإلغاء: ${reason}` : 'تم إلغاء الحجز بواسطة المريض',
          updated_by: 'المريض',
        });
      } catch (err: any) {
        console.error('Supabase cancel exception:', err?.message || 'Network error');
        return { success: false, error: 'تعذر الاتصال بقاعدة البيانات لإلغاء الحجز.' };
      }
    } else if (!isMockStoreAllowed()) {
      return { success: false, error: 'خدمة إلغاء الحجز غير متصلة بقاعدة البيانات في بيئة الإنتاج.' };
    }

    apt.status = 'CANCELLED';
    apt.updatedAt = now;
    apt.statusHistory.push({
      status: 'CANCELLED',
      timestamp: now,
      note: reason ? `تم الإلغاء: ${reason}` : 'تم إلغاء الحجز بواسطة المريض',
    });

    return { success: true };
  }

  public async getStaffAppointments(
    filters?: {
      clinicId?: string;
      status?: string;
      date?: string;
      search?: string;
    },
    staffUser?: StaffUser
  ): Promise<Appointment[]> {
    // Strict Doctor clinic isolation
    let effectiveClinicId = filters?.clinicId;
    if (staffUser?.role === 'DOCTOR') {
      if (!staffUser.clinicId) {
        return []; // Doctor with no assigned clinic is denied access to all appointments
      }
      effectiveClinicId = staffUser.clinicId;
    }

    if (isSupabaseConfigured()) {
      try {
        const supabase = createAdminClient();
        let query = supabase
          .from('appointments')
          .select('*')
          .order('appointment_date', { ascending: true })
          .order('queue_number', { ascending: true });

        if (effectiveClinicId && effectiveClinicId !== 'ALL') {
          query = query.eq('clinic_id', effectiveClinicId);
        }
        if (filters?.status && filters.status !== 'ALL') {
          query = query.eq('status', filters.status as any);
        }
        if (filters?.date && filters.date !== 'ALL') {
          query = query.eq('appointment_date', filters.date);
        }
        if (filters?.search) {
          const q = filters.search.trim();
          query = query.or(`patient_name.ilike.%${q}%,phone_number.ilike.%${q}%,reference_number.ilike.%${q}%`);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map((dbApt: any) => ({
            id: dbApt.id,
            referenceNumber: dbApt.reference_number,
            clinicId: dbApt.clinic_id,
            clinicName: dbApt.clinic_name,
            patientName: dbApt.patient_name,
            phoneNumber: dbApt.phone_number,
            patientAge: dbApt.patient_age || undefined,
            patientAddress: dbApt.patient_address || undefined,
            appointmentDate: dbApt.appointment_date,
            appointmentTime: dbApt.appointment_time,
            status: dbApt.status,
            queueNumber: dbApt.queue_number,
            lastCalledAt: dbApt.last_called_at || undefined,
            calledCount: dbApt.called_count || 0,
            notes: dbApt.notes || undefined,
            createdAt: dbApt.created_at,
            updatedAt: dbApt.updated_at,
            statusHistory: [],
          }));
        }
      } catch (err) {
        console.warn('Supabase fetch staff appointments error:', err);
      }
    }

    // Local in-memory fallback
    let result = [...this.appointments];

    if (effectiveClinicId && effectiveClinicId !== 'ALL') {
      result = result.filter((a) => a.clinicId === effectiveClinicId);
    }

    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter((a) => a.status === filters.status);
    }

    if (filters?.date && filters.date !== 'ALL') {
      result = result.filter((a) => a.appointmentDate === filters.date);
    }

    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.patientName.toLowerCase().includes(q) ||
          a.phoneNumber.includes(q) ||
          a.referenceNumber.toLowerCase().includes(q)
      );
    }

    return result;
  }
}

const globalForStore = globalThis as unknown as {
  appointmentStore?: AppointmentServiceStore;
};

export const appointmentStore = globalForStore.appointmentStore ?? new AppointmentServiceStore();
if (process.env.NODE_ENV !== 'production') {
  globalForStore.appointmentStore = appointmentStore;
}
