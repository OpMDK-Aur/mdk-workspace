-- Add Discord channel fields to clientes table
-- discord_channel_name: Display name of the channel (e.g., "ADT | Comunicacion interna")
-- discord_channel_id: The numeric Discord channel ID needed for API access

ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS discord_channel_name TEXT DEFAULT NULL;

ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS discord_channel_id TEXT DEFAULT NULL;

-- Optional: Add indexes
CREATE INDEX IF NOT EXISTS idx_clientes_discord_channel ON clientes(discord_channel_name);
CREATE INDEX IF NOT EXISTS idx_clientes_discord_channel_id ON clientes(discord_channel_id);

-- Example update for existing clientes:
-- UPDATE clientes 
-- SET discord_channel_name = 'ADT | Comunicacion interna',
--     discord_channel_id = '1234567890123456789'
-- WHERE business_name = 'ADT';
