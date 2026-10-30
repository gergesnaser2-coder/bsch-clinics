-- ========================================================================
-- BSCH Clinics — مستشفى الأطفال التخصصي بالبحيرة
-- Diagnostic Script: Read-Only Database Security & Schema Audit
-- File: supabase/diagnostics/00_read_only_audit.sql
-- ========================================================================
--
-- IMPORTANT:
-- This script contains ONLY read-only SELECT queries.
-- It does NOT modify, drop, insert, or alter any table or security policy.
-- Run this in the Supabase SQL Editor and review the results to evaluate the
-- actual state of the remote database before applying proposed RLS migrations.
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. Table RLS Status (هل RLS مفعل على كل جدول في schema public؟)
-- ------------------------------------------------------------------------
SELECT 
  schemaname, 
  tablename, 
  rowsecurity AS is_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ------------------------------------------------------------------------
-- 2. Active Row Level Security (RLS) Policies (جميع السياسات المفعلة وشروطها)
-- ------------------------------------------------------------------------
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ------------------------------------------------------------------------
-- 3. Privilege Grants to anon and authenticated Roles on Public Tables
-- ------------------------------------------------------------------------
SELECT 
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee, privilege_type;

-- ------------------------------------------------------------------------
-- 4. Function Definitions Used in Security & Policies
-- ------------------------------------------------------------------------
SELECT 
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility_category,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_current_staff_role',
    'is_active_staff',
    'get_doctor_clinic_id',
    'handle_updated_at',
    'provision_staff_member',
    'check_appointment_update_permissions'
  )
ORDER BY p.proname;

-- ------------------------------------------------------------------------
-- 5. Existing Columns in the 6 Core Tables
-- ------------------------------------------------------------------------
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'clinics',
    'clinic_schedules',
    'appointments',
    'appointment_status_history',
    'staff_profiles',
    'audit_logs'
  )
ORDER BY table_name, ordinal_position;

