-- ============================================================================
-- Dead Laptop Tracker — Complete Database Setup
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)
-- ============================================================================

-- ============================================================================
-- CLEANUP — drop existing objects if they exist (safe to run multiple times)
-- ============================================================================

DROP VIEW IF EXISTS public.device_current_state CASCADE;
DROP VIEW IF EXISTS public.handover_requests_safe CASCADE;
DROP TABLE IF EXISTS public.device_comments CASCADE;
DROP TABLE IF EXISTS public.device_reviews CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.allowed_engineers CASCADE;
DROP TABLE IF EXISTS public.handover_requests CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.device_parts CASCADE;
DROP TABLE IF EXISTS public.device_actions CASCADE;
DROP TABLE IF EXISTS public.device_events CASCADE;
DROP TABLE IF EXISTS public.device_handlers CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.sync_handler_on_action() CASCADE;
DROP FUNCTION IF EXISTS public.sync_status_on_action() CASCADE;
DROP FUNCTION IF EXISTS public.seed_parts_on_confirmed_dead() CASCADE;
DROP FUNCTION IF EXISTS public.block_parts_unless_dead() CASCADE;
DROP FUNCTION IF EXISTS public.auto_strip_when_empty() CASCADE;
DROP FUNCTION IF EXISTS public.notify_handler_change() CASCADE;
DROP FUNCTION IF EXISTS public.create_handover_request(uuid, text[], text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.accept_handover_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.broadcast_action_to_team() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_email_domain() CASCADE;
DROP FUNCTION IF EXISTS public.is_authorized_engineer() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.sync_profile_role_from_allowed_engineers() CASCADE;
DROP FUNCTION IF EXISTS public.update_review_timestamp() CASCADE;
DROP FUNCTION IF EXISTS public.update_comment_timestamp() CASCADE;

-- ============================================================================
-- MIGRATION 1 — Core Tables
-- ============================================================================

-- Profiles table (must exist before handle_new_user trigger)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'unauthorized' CHECK (role IN ('engineer', 'admin', 'unauthorized')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_role text;
BEGIN
  -- allowed_engineers may not exist yet on very first run; guard with to_regclass
  IF to_regclass('public.allowed_engineers') IS NOT NULL THEN
    SELECT role INTO allowed_role
    FROM public.allowed_engineers
    WHERE email = NEW.email;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(allowed_role, 'unauthorized')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = EXCLUDED.email,
    role = COALESCE(allowed_role, public.profiles.role);

  RETURN NEW;
END;
 $$;

-- Trigger: create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: sync profile role when allowed_engineers is updated
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_allowed_engineers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Update the profile role when an engineer is added or updated
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.profiles
    SET role = CASE
      WHEN NEW.role = 'admin' THEN 'admin'
      WHEN NEW.role = 'engineer' THEN 'engineer'
      ELSE public.profiles.role
    END
    WHERE email = NEW.email
      AND public.profiles.role IN ('engineer', 'admin', 'unauthorized');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_role ON public.allowed_engineers;
CREATE TRIGGER sync_profile_role
  AFTER INSERT OR UPDATE ON public.allowed_engineers
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_allowed_engineers();

-- Devices table
CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code text NOT NULL UNIQUE,
  asset_tag text,
  serial_number text,
  brand text,
  model text,
  status text NOT NULL DEFAULT 'dead' CHECK (status IN ('dead', 'in_repair', 'repaired', 'active', 'disposed', 'stripped')),
  location text,
  notes text,
  marked_dead_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Device handlers (custody tracking)
CREATE TABLE IF NOT EXISTS public.device_handlers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  handler_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

-- Device events (legacy audit log)
CREATE TABLE IF NOT EXISTS public.device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- MIGRATION 2 — Engineer Action Workflow
-- ============================================================================

-- Device actions (core interaction log)
CREATE TABLE IF NOT EXISTS public.device_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN (
    'received', 'diagnosing', 'attempting_repair', 'parts_ordered',
    'testing', 'escalated', 'repaired', 'confirmed_dead', 'note',
    'part_recycled', 'stripped'
  )),
  result text,
  status_before text,
  status_after text,
  notes text,
  action_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-transfer custody on action
CREATE OR REPLACE FUNCTION public.sync_handler_on_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Release previous handler
  UPDATE public.device_handlers
  SET released_at = now()
  WHERE device_id = NEW.device_id
    AND released_at IS NULL;

  -- Assign new handler
  INSERT INTO public.device_handlers (device_id, handler_id, assigned_at)
  VALUES (NEW.device_id, NEW.engineer_id, now());

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS sync_handler_on_action ON public.device_actions;
CREATE TRIGGER sync_handler_on_action
  AFTER INSERT ON public.device_actions
  FOR EACH ROW EXECUTE FUNCTION public.sync_handler_on_action();

-- Trigger: auto-update device status on milestone actions
CREATE OR REPLACE FUNCTION public.sync_status_on_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_status text;
BEGIN
  NEW.status_before := (SELECT status FROM public.devices WHERE id = NEW.device_id);

  new_status := CASE NEW.action_type
    WHEN 'confirmed_dead' THEN 'dead'
    WHEN 'attempting_repair' THEN 'in_repair'
    WHEN 'repaired' THEN 'repaired'
    WHEN 'stripped' THEN 'stripped'
    ELSE NULL
  END;

  IF new_status IS NOT NULL THEN
    NEW.status_after := new_status;
    UPDATE public.devices
    SET status = new_status, updated_at = now()
    WHERE id = NEW.device_id;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS sync_status_on_action ON public.device_actions;
CREATE TRIGGER sync_status_on_action
  BEFORE INSERT ON public.device_actions
  FOR EACH ROW EXECUTE FUNCTION public.sync_status_on_action();

-- Note: device_current_state view is created AFTER all dependencies
-- (see end of MIGRATION 3)

-- ============================================================================
-- MIGRATION 3 — Parts Recycling
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  part_type text NOT NULL CHECK (part_type IN (
    'ram', 'ssd', 'hdd', 'display', 'keyboard', 'battery',
    'motherboard', 'charger', 'trackpad', 'wifi_card', 'other'
  )),
  part_description text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'recycled', 'discarded')),
  recycled_by uuid REFERENCES public.profiles(id),
  recycled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-seed standard parts when device is confirmed dead
CREATE OR REPLACE FUNCTION public.seed_parts_on_confirmed_dead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'dead' AND (OLD.status IS NULL OR OLD.status != 'dead') THEN
    INSERT INTO public.device_parts (device_id, part_type) VALUES
      (NEW.id, 'ram'), (NEW.id, 'ssd'), (NEW.id, 'display'),
      (NEW.id, 'keyboard'), (NEW.id, 'battery'), (NEW.id, 'motherboard')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS seed_parts_on_confirmed_dead ON public.devices;
CREATE TRIGGER seed_parts_on_confirmed_dead
  AFTER INSERT OR UPDATE OF status ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.seed_parts_on_confirmed_dead();

-- Trigger: block recycling unless device is dead
CREATE OR REPLACE FUNCTION public.block_parts_unless_dead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  device_status text;
BEGIN
  SELECT status INTO device_status FROM public.devices WHERE id = NEW.device_id;

  IF device_status != 'dead' THEN
    RAISE EXCEPTION 'Can only recycle parts from devices with status=dead. Current status: %', device_status;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS block_parts_unless_dead ON public.device_parts;
CREATE TRIGGER block_parts_unless_dead
  BEFORE INSERT OR UPDATE OF status ON public.device_parts
  FOR EACH ROW
  WHEN (NEW.status IN ('recycled', 'discarded'))
  EXECUTE FUNCTION public.block_parts_unless_dead();

-- Trigger: auto-flip device to stripped when all parts recycled
CREATE OR REPLACE FUNCTION public.auto_strip_when_empty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  available_count integer;
BEGIN
  SELECT count(*) INTO available_count
  FROM public.device_parts
  WHERE device_id = NEW.device_id AND status = 'available';

  IF available_count = 0 THEN
    UPDATE public.devices
    SET status = 'stripped', updated_at = now()
    WHERE id = NEW.device_id;

    INSERT INTO public.device_actions (device_id, engineer_id, action_type, result, action_at)
    VALUES (NEW.device_id, NEW.recycled_by, 'stripped', 'All parts recycled — device auto-stripped', now());
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS auto_strip_when_empty ON public.device_parts;
CREATE TRIGGER auto_strip_when_empty
  AFTER UPDATE OF status ON public.device_parts
  FOR EACH ROW
  WHEN (NEW.status IN ('recycled', 'discarded'))
  EXECUTE FUNCTION public.auto_strip_when_empty();

-- View: device current state (created here after all dependencies exist)
CREATE OR REPLACE VIEW public.device_current_state AS
SELECT
  d.id,
  d.qr_code,
  d.asset_tag,
  d.serial_number,
  d.brand,
  d.model,
  d.status,
  d.location,
  d.notes,
  d.marked_dead_at,
  dh.handler_id AS current_handler_id,
  p.full_name AS current_handler_name,
  (
    SELECT da.action_type
    FROM public.device_actions da
    WHERE da.device_id = d.id
    ORDER BY da.action_at DESC
    LIMIT 1
  ) AS last_action_type,
  (
    SELECT da.action_at
    FROM public.device_actions da
    WHERE da.device_id = d.id
    ORDER BY da.action_at DESC
    LIMIT 1
  ) AS last_action_at,
  (
    SELECT count(*)
    FROM public.device_parts dp
    WHERE dp.device_id = d.id AND dp.status = 'available'
  ) AS parts_remaining
FROM public.devices d
LEFT JOIN public.device_handlers dh
  ON dh.device_id = d.id AND dh.released_at IS NULL
LEFT JOIN public.profiles p
  ON p.id = dh.handler_id;

-- ============================================================================
-- MIGRATION 4 — Personal Notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('now_holding', 'released', 'team_activity')),
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: notify old + new handler on custody change
CREATE OR REPLACE FUNCTION public.notify_handler_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  device_qr text;
  new_handler_email text;
BEGIN
  SELECT qr_code INTO device_qr FROM public.devices WHERE id = NEW.device_id;
  SELECT email INTO new_handler_email FROM public.profiles WHERE id = NEW.handler_id;

  -- Notify the new handler
  INSERT INTO public.notifications (device_id, recipient_id, notification_type, message)
  VALUES (
    NEW.device_id,
    NEW.handler_id,
    'now_holding',
    'You are now holding device ' || COALESCE(device_qr, NEW.device_id::text)
  );

  -- Notify previously released handler (if any)
  IF NEW.released_at IS NOT NULL THEN
    INSERT INTO public.notifications (device_id, recipient_id, notification_type, message)
    SELECT
      dh.device_id,
      dh.handler_id,
      'released',
      'You released device ' || COALESCE(device_qr, dh.device_id::text)
    FROM public.device_handlers dh
    WHERE dh.device_id = NEW.device_id
      AND dh.handler_id != NEW.handler_id
      AND dh.released_at = NEW.released_at
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS notify_handler_change ON public.device_handlers;
CREATE TRIGGER notify_handler_change
  AFTER INSERT ON public.device_handlers
  FOR EACH ROW EXECUTE FUNCTION public.notify_handler_change();

-- ============================================================================
-- MIGRATION 5 — Permissioned Handover
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.handover_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  allowed_emails text[] NOT NULL DEFAULT '{}',
  passcode_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  accepted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- View: safe handover requests (no passcode_hash)
CREATE OR REPLACE VIEW public.handover_requests_safe AS
SELECT
  id, device_id, created_by, allowed_emails, status,
  expires_at, accepted_by, created_at
FROM public.handover_requests;

-- RPC: create handover request
CREATE OR REPLACE FUNCTION public.create_handover_request(
  device_id uuid,
  allowed_emails text[],
  passcode text,
  expires_in_minutes integer DEFAULT 60,
  notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  request_id uuid;
  current_handler_id uuid;
BEGIN
  -- Verify caller is current handler
  SELECT handler_id INTO current_handler_id
  FROM public.device_handlers
  WHERE device_id = create_handover_request.device_id AND released_at IS NULL;

  IF current_handler_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the current handler can create a handover request for this device.';
  END IF;

  INSERT INTO public.handover_requests (device_id, created_by, allowed_emails, passcode_hash, expires_at, notes)
  VALUES (
    create_handover_request.device_id,
    auth.uid(),
    create_handover_request.allowed_emails,
    crypt(create_handover_request.passcode, gen_salt('bf')),
    now() + (create_handover_request.expires_in_minutes || ' minutes')::interval,
    create_handover_request.notes
  )
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;

-- RPC: accept handover request
CREATE OR REPLACE FUNCTION public.accept_handover_request(
  device_id uuid,
  passcode text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  request record;
BEGIN
  -- Find pending request
  SELECT * INTO request
  FROM public.handover_requests
  WHERE device_id = accept_handover_request.device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending handover request found for this device.';
  END IF;

  -- Verify email allowlist
  IF NOT (auth.email() = ANY(request.allowed_emails)) THEN
    RAISE EXCEPTION 'Your email is not in the allowed list for this handover.';
  END IF;

  -- Verify passcode
  IF request.passcode_hash != crypt(accept_handover_request.passcode, request.passcode_hash) THEN
    RAISE EXCEPTION 'Invalid passcode.';
  END IF;

  -- Update request
  UPDATE public.handover_requests
  SET status = 'accepted', accepted_by = auth.uid()
  WHERE id = request.id;

  -- Log received action (triggers custody transfer)
  INSERT INTO public.device_actions (device_id, engineer_id, action_type, action_at)
  VALUES (accept_handover_request.device_id, auth.uid(), 'received', now());

  RETURN true;
END;
 $$;

-- Enable pgcrypto for passcode hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- MIGRATION 6 — SSO/Domain Allowlist Tightening
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.allowed_engineers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'engineer' CHECK (role IN ('engineer', 'admin')),
  added_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper: check if current user is authorized engineer
CREATE OR REPLACE FUNCTION public.is_authorized_engineer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('engineer', 'admin')
  );
 $$;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
 $$;

-- ============================================================================
-- MIGRATION 7 — Gemini Chat + Team Broadcasts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model', 'function')),
  content text NOT NULL DEFAULT '',
  tool_call jsonb,
  tool_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: broadcast action to team
CREATE OR REPLACE FUNCTION public.broadcast_action_to_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  device_qr text;
  engineer_name text;
BEGIN
  SELECT qr_code INTO device_qr FROM public.devices WHERE id = NEW.device_id;
  SELECT full_name INTO engineer_name FROM public.profiles WHERE id = NEW.engineer_id;

  INSERT INTO public.notifications (device_id, recipient_id, notification_type, message)
  SELECT
    NEW.device_id,
    p.id,
    'team_activity',
    engineer_name || ' performed ' || REPLACE(NEW.action_type, '_', ' ') || ' on device ' || COALESCE(device_qr, NEW.device_id::text)
  FROM public.profiles p
  WHERE p.id != NEW.engineer_id
    AND p.role IN ('engineer', 'admin');

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS broadcast_action_to_team ON public.device_actions;
CREATE TRIGGER broadcast_action_to_team
  AFTER INSERT ON public.device_actions
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_action_to_team();

-- ============================================================================
-- MIGRATION 8 — Domain Restriction
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email NOT LIKE '%@safaricom.co.ke' THEN
    RAISE EXCEPTION 'Only @safaricom.co.ke email addresses are allowed. Got: %', NEW.email;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS enforce_email_domain ON auth.users;
CREATE TRIGGER enforce_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_domain();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
-- Allow users to read their own profile (needed for auth state to work)
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Devices policies
CREATE POLICY "Authorized engineers can view devices"
  ON public.devices FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can insert devices"
  ON public.devices FOR INSERT
  WITH CHECK (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can update devices"
  ON public.devices FOR UPDATE
  USING (public.is_authorized_engineer());

CREATE POLICY "Admins can delete devices"
  ON public.devices FOR DELETE
  USING (public.is_admin());

-- Device handlers policies
CREATE POLICY "Authorized engineers can view handlers"
  ON public.device_handlers FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can insert handlers"
  ON public.device_handlers FOR INSERT
  WITH CHECK (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can update handlers"
  ON public.device_handlers FOR UPDATE
  USING (public.is_authorized_engineer());

-- Device events policies
CREATE POLICY "Authorized engineers can view events"
  ON public.device_events FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can insert events"
  ON public.device_events FOR INSERT
  WITH CHECK (public.is_authorized_engineer());

-- Device actions policies
CREATE POLICY "Authorized engineers can view actions"
  ON public.device_actions FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can insert actions"
  ON public.device_actions FOR INSERT
  WITH CHECK (public.is_authorized_engineer());

-- Device parts policies
CREATE POLICY "Authorized engineers can view parts"
  ON public.device_parts FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can insert parts"
  ON public.device_parts FOR INSERT
  WITH CHECK (public.is_authorized_engineer());

CREATE POLICY "Authorized engineers can update parts"
  ON public.device_parts FOR UPDATE
  USING (public.is_authorized_engineer());

-- Notifications policies
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Handover requests policies
CREATE POLICY "Involved parties can view handover requests"
  ON public.handover_requests FOR SELECT
  USING (
    public.is_authorized_engineer() AND (
      created_by = auth.uid() OR
      auth.email() = ANY(allowed_emails) OR
      public.is_admin()
    )
  );

CREATE POLICY "Current handler can create handover requests"
  ON public.handover_requests FOR INSERT
  WITH CHECK (created_by = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Allowed recipients can update handover requests"
  ON public.handover_requests FOR UPDATE
  USING (
    public.is_authorized_engineer() AND (
      auth.email() = ANY(allowed_emails) OR
      created_by = auth.uid() OR
      public.is_admin()
    )
  );

-- Allowed engineers policies
CREATE POLICY "Admins can manage allowed engineers"
  ON public.allowed_engineers FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authorized engineers can view allowed engineers"
  ON public.allowed_engineers FOR SELECT
  USING (public.is_authorized_engineer());

-- Chat messages policies
CREATE POLICY "Users can view own chat messages"
  ON public.chat_messages FOR SELECT
  USING (engineer_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Users can insert own chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (engineer_id = auth.uid() AND public.is_authorized_engineer());

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Allow anon to read nothing (they must authenticate)
-- Allow authenticated users to use the app
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.devices TO authenticated;
GRANT SELECT ON public.device_current_state TO authenticated;
GRANT SELECT ON public.handover_requests_safe TO authenticated;

-- ============================================================================
-- MIGRATION 9 — Device Reviews and Comments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.device_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  review_id uuid REFERENCES public.device_reviews(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.device_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: update review timestamp on edit
CREATE OR REPLACE FUNCTION public.update_review_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_review_timestamp ON public.device_reviews;
CREATE TRIGGER update_review_timestamp
  BEFORE UPDATE ON public.device_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_review_timestamp();

-- Trigger: update comment timestamp on edit
CREATE OR REPLACE FUNCTION public.update_comment_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_comment_timestamp ON public.device_comments;
CREATE TRIGGER update_comment_timestamp
  BEFORE UPDATE ON public.device_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_comment_timestamp();

-- RLS policies for reviews
CREATE POLICY "Authorized engineers can view device reviews"
  ON public.device_reviews FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Engineers can insert own reviews"
  ON public.device_reviews FOR INSERT
  WITH CHECK (engineer_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Engineers can update own reviews"
  ON public.device_reviews FOR UPDATE
  USING (engineer_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Engineers can delete own reviews"
  ON public.device_reviews FOR DELETE
  USING (engineer_id = auth.uid() AND public.is_authorized_engineer());

-- RLS policies for comments
CREATE POLICY "Authorized engineers can view device comments"
  ON public.device_comments FOR SELECT
  USING (public.is_authorized_engineer());

CREATE POLICY "Engineers can insert own comments"
  ON public.device_comments FOR INSERT
  WITH CHECK (engineer_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Engineers can update own comments"
  ON public.device_comments FOR UPDATE
  USING (engineer_id = auth.uid() AND public.is_authorized_engineer());

CREATE POLICY "Engineers can delete own comments"
  ON public.device_comments FOR DELETE
  USING (engineer_id = auth.uid() AND public.is_authorized_engineer());

-- ============================================================================
-- MIGRATION 10 — RLS policies for reviews/comments
-- ============================================================================

ALTER TABLE public.device_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SEED YOUR ADMIN USER
-- ============================================================================

-- After running this script, insert yourself as the first admin:
-- (Run this AFTER your first SSO login creates a profile with role='unauthorized')
--
-- INSERT INTO public.allowed_engineers (email, full_name, role)
-- VALUES ('smacharia6@safaricom.co.ke', 'Sam Macharia', 'admin')
-- ON CONFLICT (email) DO UPDATE SET role = 'admin';
--
-- Then update your profile:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'smacharia6@safaricom.co.ke';

-- ============================================================================
-- END
-- ============================================================================
