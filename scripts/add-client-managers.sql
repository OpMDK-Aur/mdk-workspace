-- Add project_manager_id and account_manager_id to clients table
-- These reference profiles.id (UUID)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS project_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
