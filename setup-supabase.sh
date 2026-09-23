#!/bin/bash
# ============================================================================
# Dead Laptop Tracker — Supabase Setup Script
# Run these commands in order to fully configure your Supabase backend
# ============================================================================

# 1. Login to Supabase (if not already logged in)
# npm install -g supabase
# supabase login

# 2. Link to your Supabase project (replace <project-ref> with your actual project ref)
# supabase link --project-ref fszehpcglpbzxfbkypod

# 3. Run the database migrations
# Option A: Using Supabase CLI (recommended)
# supabase start   # Start local dev database
# supabase db reset # Apply migrations locally

# Option B: Copy the contents of supabase-migrations.sql and run in Supabase Dashboard SQL Editor
# https://supabase.com/dashboard/project/fszehpcglpbzxfbkypod/sql/new

# 4. Run the seed data
# Copy the contents of supabase-seed-data.sql and run in Supabase SQL Editor

# 5. Deploy the Gemini Agent Edge Function
# (Assumes the function code is in supabase/functions/gemini-agent/index.ts)
# supabase functions deploy gemini-agent

# 6. Set the Gemini API key secret
# supabase secrets set GEMINI_API_KEY=your-gemini-api-key-here

# 7. Configure SAML SSO for safaricom.co.ke
# You need your IdP metadata XML file from Okta/Azure AD
# supabase sso add --domain safaricom.co.ke

# 8. Add yourself as the first admin (after running migration + login once)
# INSERT INTO public.allowed_engineers (email, full_name, role)
# VALUES ('your-email@safaricom.co.ke', 'Your Name', 'admin')
# ON CONFLICT (email) DO UPDATE SET role = 'admin';
#
# Then update your profile:
# UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@safaricom.co.ke';

# ============================================================================
# FRONTEND SETUP
# ============================================================================

# 9. Create .env file from .env.example
# cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key:
#   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-key-here
#   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here

# 10. Install dependencies
# npm install

# 11. Start the dev server
# npm run dev

# ============================================================================
# NOTES:
# - Step 7 requires SAML IdP metadata from your Okta/Azure AD admin
# - The Edge Function (step 5) requires the function code to exist locally
# - After setup, test SSO at: https://your-project-ref.supabase.co/auth/v1/sso
# - Make sure your profile role is 'admin' to access /admin page
# ============================================================================
