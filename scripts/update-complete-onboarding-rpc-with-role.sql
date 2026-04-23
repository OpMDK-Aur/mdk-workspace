-- Update complete_user_onboarding RPC to include role parameter
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION complete_user_onboarding(
  p_user_id UUID,
  p_full_name TEXT,
  p_avatar_url TEXT,
  p_role TEXT,
  p_theme TEXT,
  p_accent_hue INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    full_name = p_full_name,
    avatar_url = NULLIF(p_avatar_url, ''),
    role = p_role,
    theme = p_theme,
    accent_hue = p_accent_hue,
    onboarding_completed = true,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;
