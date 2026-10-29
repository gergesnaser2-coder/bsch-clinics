export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type StaffRole = 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR';

export type AppointmentStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          location: string;
          working_hours: string;
          days_of_week: number[];
          max_daily_slots: number;
          slot_duration_minutes: number;
          instructions: string | null;
          is_active: boolean;
          is_hospital_confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          location: string;
          working_hours?: string;
          days_of_week?: number[];
          max_daily_slots?: number;
          slot_duration_minutes?: number;
          instructions?: string | null;
          is_active?: boolean;
          is_hospital_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          location?: string;
          working_hours?: string;
          days_of_week?: number[];
          max_daily_slots?: number;
          slot_duration_minutes?: number;
          instructions?: string | null;
          is_active?: boolean;
          is_hospital_confirmed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          role: StaffRole;
          clinic_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          role?: StaffRole;
          clinic_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          full_name?: string;
          role?: StaffRole;
          clinic_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      clinic_schedules: {
        Row: {
          id: string;
          clinic_id: string;
          schedule_date: string;
          max_capacity: number;
          is_closed: boolean;
          closure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          schedule_date: string;
          max_capacity?: number;
          is_closed?: boolean;
          closure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          schedule_date?: string;
          max_capacity?: number;
          is_closed?: boolean;
          closure_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          patient_name: string;
          phone_number: string;
          patient_age: string | null;
          patient_address: string | null;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          queue_number: number | null;
          last_called_at: string | null;
          called_count: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          patient_name: string;
          phone_number: string;
          patient_age?: string | null;
          patient_address?: string | null;
          appointment_date: string;
          appointment_time?: string;
          status?: AppointmentStatus;
          queue_number?: number | null;
          last_called_at?: string | null;
          called_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reference_number?: string;
          clinic_id?: string;
          clinic_name?: string;
          patient_name?: string;
          phone_number?: string;
          patient_age?: string | null;
          patient_address?: string | null;
          appointment_date?: string;
          appointment_time?: string;
          status?: AppointmentStatus;
          queue_number?: number | null;
          last_called_at?: string | null;
          called_count?: number;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointment_status_history: {
        Row: {
          id: string;
          appointment_id: string;
          status: AppointmentStatus;
          note: string | null;
          updated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          status: AppointmentStatus;
          note?: string | null;
          updated_by?: string | null;
          created_at?: string;
        };
        Update: {
          status?: AppointmentStatus;
          note?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          details?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      book_appointment_atomic: {
        Args: {
          p_clinic_id: string;
          p_patient_name: string;
          p_phone_number: string;
          p_patient_age?: string | null;
          p_patient_address?: string | null;
          p_appointment_date?: string | null;
          p_appointment_time?: string;
          p_reference_number?: string | null;
        };
        Returns: Json;
      };
      track_appointment_secure: {
        Args: {
          p_reference_number: string;
          p_phone_number: string;
        };
        Returns: {
          reference_number: string;
          clinic_id: string;
          clinic_name: string;
          patient_name: string;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          queue_number: number | null;
        }[];
      };
      is_active_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_current_staff_role: {
        Args: Record<string, never>;
        Returns: StaffRole;
      };
      get_doctor_clinic_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: {
      staff_role: StaffRole;
      appointment_status: AppointmentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
