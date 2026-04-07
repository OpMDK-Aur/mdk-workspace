-- Add user preferences columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accent_hue numeric DEFAULT 55,
  ADD COLUMN IF NOT EXISTS theme text DEFAULT 'system';
