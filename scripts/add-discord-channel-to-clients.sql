-- Add Discord channel fields to clients table
-- discord_channel_name: Display name of the channel (e.g., "ADT | Comunicacion interna")
-- discord_channel_id: The numeric Discord channel ID needed for API access

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS discord_channel_name TEXT DEFAULT NULL;

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS discord_channel_id TEXT DEFAULT NULL;

-- Optional: Add indexes
CREATE INDEX IF NOT EXISTS idx_clients_discord_channel ON clients(discord_channel_name);
CREATE INDEX IF NOT EXISTS idx_clients_discord_channel_id ON clients(discord_channel_id);

-- Example update for existing clients:
-- UPDATE clients 
-- SET discord_channel_name = 'ADT | Comunicacion interna',
--     discord_channel_id = '1234567890123456789'
-- WHERE business_name = 'ADT';
