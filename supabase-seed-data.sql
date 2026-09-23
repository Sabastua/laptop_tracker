-- ============================================================================
-- Dead Laptop Tracker — Test Data Seed Script
-- Run this in Supabase SQL Editor AFTER running supabase-migrations.sql
-- 
-- IMPORTANT: This script seeds data for testing. Profiles are auto-created
-- by the handle_new_user trigger when a user first signs in via SSO/email.
-- Run this AFTER your admin user has logged in at least once.
-- ============================================================================

-- ============================================================================
-- Step 1: Seed allowed_engineers (for admin to be able to access the app)
-- ============================================================================

-- Add admin engineer
INSERT INTO public.allowed_engineers (email, full_name, role)
VALUES ('admin@safaricom.co.ke', 'Admin User', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- Add test engineers
INSERT INTO public.allowed_engineers (email, full_name, role)
VALUES
  ('engineer1@safaricom.co.ke', 'Test Engineer One', 'engineer'),
  ('engineer2@safaricom.co.ke', 'Test Engineer Two', 'engineer')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- Step 2: Promote admin profile to admin role (run after first login)
-- ============================================================================
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@safaricom.co.ke';

-- ============================================================================
-- SEED DEVICES
-- ============================================================================

INSERT INTO public.devices (qr_code, asset_tag, serial_number, brand, model, status, location, notes, marked_dead_at)
VALUES
  ('QR-001', 'ASSET-001', 'SN-DELL-001', 'Dell', 'Latitude 5520', 'dead', 'Workshop A', 'Failed to power on, suspected motherboard failure', now() - interval '7 days'),
  ('QR-002', 'ASSET-002', 'SN-HP-002', 'HP', 'EliteBook 840', 'in_repair', 'Workshop B', 'Replacing display panel', now() - interval '5 days'),
  ('QR-003', 'ASSET-003', 'SN-LEN-003', 'Lenovo', 'ThinkPad T14', 'repaired', 'Storage', 'RAM upgrade completed', now() - interval '10 days'),
  ('QR-004', 'ASSET-004', 'SN-DELL-004', 'Dell', 'XPS 13', 'active', 'Office', 'Deployed to user', now() - interval '2 days'),
  ('QR-005', 'ASSET-005', 'SN-HP-005', 'HP', 'Pavilion 15', 'stripped', 'Parts Bin', 'All parts recycled', now() - interval '14 days'),
  ('QR-006', 'ASSET-006', 'SN-LEN-006', 'Lenovo', 'IdeaPad 3', 'dead', 'Workshop A', 'Water damage', now() - interval '3 days'),
  ('QR-007', 'ASSET-007', 'SN-DELL-007', 'Dell', 'Inspiron 15', 'disposed', 'Disposal Unit', 'Sent for disposal', now() - interval '20 days'),
  ('QR-008', 'ASSET-008', 'SN-HP-008', 'HP', 'ProBook 450', 'in_repair', 'Workshop B', 'SSD replacement', now() - interval '1 day'),
  ('QR-009', 'ASSET-009', 'SN-LEN-009', 'Lenovo', 'ThinkPad X1', 'repaired', 'QC Station', 'Passed all tests', now() - interval '4 days'),
  ('QR-010', 'ASSET-010', 'SN-DELL-010', 'Dell', 'Latitude 3420', 'dead', 'Workshop A', 'CPU failure', now() - interval '6 days'),
  ('QR-011', 'ASSET-011', 'SN-HP-011', 'HP', 'EliteBook 850', 'active', 'Office', 'In use by engineer', now() - interval '1 day'),
  ('QR-012', 'ASSET-012', 'SN-LEN-012', 'Lenovo', 'ThinkPad P15', 'in_repair', 'Workshop B', 'GPU replacement', now() - interval '2 days')
ON CONFLICT (qr_code) DO NOTHING;

-- ============================================================================
-- SEED DEVICE PARTS (for dead devices only)
-- ============================================================================
-- Note: The seed_parts_on_confirmed_dead trigger auto-seeds parts when a
-- device transitions to 'dead' status. For existing dead devices, we insert
-- them explicitly here.

DO $$
DECLARE
  device1_id uuid;
  device6_id uuid;
  device10_id uuid;
BEGIN
  SELECT id INTO device1_id FROM public.devices WHERE qr_code = 'QR-001';
  SELECT id INTO device6_id FROM public.devices WHERE qr_code = 'QR-006';
  SELECT id INTO device10_id FROM public.devices WHERE qr_code = 'QR-010';

  -- QR-001 parts (all available)
  INSERT INTO public.device_parts (device_id, part_type)
  VALUES
    (device1_id, 'ram'),
    (device1_id, 'ssd'),
    (device1_id, 'display'),
    (device1_id, 'keyboard'),
    (device1_id, 'battery'),
    (device1_id, 'motherboard')
  ON CONFLICT DO NOTHING;

  -- QR-006 parts (some already recycled)
  INSERT INTO public.device_parts (device_id, part_type, status, recycled_by, recycled_at)
  VALUES
    (device6_id, 'ram', 'recycled', NULL, now() - interval '2 days'),
    (device6_id, 'ssd', 'recycled', NULL, now() - interval '2 days'),
    (device6_id, 'display', 'available', NULL, NULL),
    (device6_id, 'keyboard', 'discarded', NULL, now() - interval '2 days'),
    (device6_id, 'battery', 'available', NULL, NULL),
    (device6_id, 'motherboard', 'recycled', NULL, now() - interval '2 days')
  ON CONFLICT DO NOTHING;

  -- QR-010 parts (all available)
  INSERT INTO public.device_parts (device_id, part_type)
  VALUES
    (device10_id, 'ram'),
    (device10_id, 'ssd'),
    (device10_id, 'display'),
    (device10_id, 'keyboard'),
    (device10_id, 'battery'),
    (device10_id, 'motherboard')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- SEED DEVICE HANDLERS (custody history)
-- ============================================================================
-- These reference profile IDs from auth.users. This script only inserts
-- handlers for profiles that actually exist (i.e. users who have logged in).

DO $$
DECLARE
  device1_id uuid;
  device2_id uuid;
  device3_id uuid;
  device4_id uuid;
  device6_id uuid;
  device8_id uuid;
  admin_id uuid;
  engineer1_id uuid;
BEGIN
  SELECT id INTO device1_id FROM public.devices WHERE qr_code = 'QR-001';
  SELECT id INTO device2_id FROM public.devices WHERE qr_code = 'QR-002';
  SELECT id INTO device3_id FROM public.devices WHERE qr_code = 'QR-003';
  SELECT id INTO device4_id FROM public.devices WHERE qr_code = 'QR-004';
  SELECT id INTO device6_id FROM public.devices WHERE qr_code = 'QR-006';
  SELECT id INTO device8_id FROM public.devices WHERE qr_code = 'QR-008';

  -- Get admin profile (created by SSO/login)
  SELECT id INTO admin_id FROM public.profiles WHERE email = 'admin@safaricom.co.ke';

  -- Get engineer1 profile (created by SSO/login)
  SELECT id INTO engineer1_id FROM public.profiles WHERE email = 'engineer1@safaricom.co.ke';

  -- QR-001: admin received it, still holding
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
    VALUES (device1_id, admin_id, now() - interval '7 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-002: engineer1 is currently repairing
  IF engineer1_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
    VALUES (device2_id, engineer1_id, now() - interval '3 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-003: admin repaired it, released
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at, released_at)
    VALUES (device3_id, admin_id, now() - interval '10 days', now() - interval '8 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-004: admin deployed it
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
    VALUES (device4_id, admin_id, now() - interval '2 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-006: engineer1 is working on it
  IF engineer1_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
    VALUES (device6_id, engineer1_id, now() - interval '2 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-008: engineer1 is repairing
  IF engineer1_id IS NOT NULL THEN
    INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
    VALUES (device8_id, engineer1_id, now() - interval '1 day')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- SEED DEVICE ACTIONS (audit log)
-- ============================================================================

DO $$
DECLARE
  device1_id uuid;
  device2_id uuid;
  device3_id uuid;
  device6_id uuid;
  device8_id uuid;
  admin_id uuid;
  engineer1_id uuid;
BEGIN
  SELECT id INTO device1_id FROM public.devices WHERE qr_code = 'QR-001';
  SELECT id INTO device2_id FROM public.devices WHERE qr_code = 'QR-002';
  SELECT id INTO device3_id FROM public.devices WHERE qr_code = 'QR-003';
  SELECT id INTO device6_id FROM public.devices WHERE qr_code = 'QR-006';
  SELECT id INTO device8_id FROM public.devices WHERE qr_code = 'QR-008';
  SELECT id INTO admin_id FROM public.profiles WHERE email = 'admin@safaricom.co.ke';
  SELECT id INTO engineer1_id FROM public.profiles WHERE email = 'engineer1@safaricom.co.ke';

  -- QR-001 actions (admin)
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, notes, action_at)
    VALUES
      (device1_id, admin_id, 'received', 'Device received in workshop', 'Initial assessment', now() - interval '7 days'),
      (device1_id, admin_id, 'diagnosing', 'Motherboard failure suspected', 'No POST signal', now() - interval '6 days'),
      (device1_id, admin_id, 'confirmed_dead', 'Confirmed dead - motherboard replacement needed', 'Failed diagnostics', now() - interval '5 days')
    ON CONFLICT DO NOTHING;

    -- QR-003 actions (admin)
    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, notes, action_at)
    VALUES
      (device3_id, admin_id, 'received', 'Device received', 'Slow performance', now() - interval '12 days'),
      (device3_id, admin_id, 'diagnosing', 'RAM upgrade needed', '8GB to 16GB', now() - interval '11 days'),
      (device3_id, admin_id, 'repaired', 'RAM upgraded', 'Passed all tests', now() - interval '10 days')
    ON CONFLICT DO NOTHING;
  END IF;

  -- QR-002 actions (engineer1)
  IF engineer1_id IS NOT NULL THEN
    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, notes, action_at)
    VALUES
      (device2_id, engineer1_id, 'received', 'Device received', 'Display broken', now() - interval '5 days'),
      (device2_id, engineer1_id, 'attempting_repair', 'Replacing display panel', 'Part ordered', now() - interval '3 days')
    ON CONFLICT DO NOTHING;

    -- QR-006 actions (engineer1)
    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, notes, action_at)
    VALUES
      (device6_id, engineer1_id, 'received', 'Water damage', 'Left side ports corroded', now() - interval '3 days'),
      (device6_id, engineer1_id, 'attempting_repair', 'Cleaning and testing', 'Some parts recyclable', now() - interval '2 days')
    ON CONFLICT DO NOTHING;

    -- QR-008 actions (engineer1)
    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, notes, action_at)
    VALUES
      (device8_id, engineer1_id, 'received', 'SSD failure', 'Boot loop', now() - interval '2 days'),
      (device8_id, engineer1_id, 'parts_ordered', 'SSD ordered', '1TB NVMe', now() - interval '1 day'),
      (device8_id, engineer1_id, 'attempting_repair', 'SSD replacement in progress', 'Awaiting part arrival', now() - interval '1 day')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- SEED CHAT MESSAGES (for testing AI assistant)
-- ============================================================================

DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE email = 'admin@safaricom.co.ke';

  IF admin_id IS NOT NULL THEN
    INSERT INTO public.chat_messages (engineer_id, role, content)
    VALUES
      (admin_id, 'user', 'Show me all dead laptops'),
      (admin_id, 'model', 'I found 3 dead laptops: QR-001 (Dell Latitude 5520), QR-006 (Lenovo IdeaPad 3), and QR-010 (Dell Latitude 3420). Would you like more details on any of them?')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 'Seed data inserted successfully!' AS status;

SELECT
  d.qr_code,
  d.status,
  COUNT(da.id) AS action_count,
  COUNT(dh.id) AS handler_count
FROM public.devices d
LEFT JOIN public.device_actions da ON da.device_id = d.id
LEFT JOIN public.device_handlers dh ON dh.device_id = d.id
GROUP BY d.qr_code, d.status
ORDER BY d.qr_code;
