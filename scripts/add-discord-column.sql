-- Add Discord ID column to colaboradores table
-- This stores the Discord user ID from OAuth authentication

ALTER TABLE colaboradores 
ADD COLUMN IF NOT EXISTS discord_id TEXT DEFAULT NULL;

ALTER TABLE colaboradores 
ADD COLUMN IF NOT EXISTS discord_username TEXT DEFAULT NULL;

ALTER TABLE colaboradores 
ADD COLUMN IF NOT EXISTS discord_avatar TEXT DEFAULT NULL;

-- Create index for faster lookups by discord_id
CREATE INDEX IF NOT EXISTS idx_colaboradores_discord_id ON colaboradores(discord_id);

-- Comment for documentation
COMMENT ON COLUMN colaboradores.discord_id IS 'Discord user ID from OAuth authentication';
COMMENT ON COLUMN colaboradores.discord_username IS 'Discord username for display purposes';
COMMENT ON COLUMN colaboradores.discord_avatar IS 'Discord avatar URL';
