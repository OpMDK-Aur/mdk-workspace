-- Add Discord channel name to clients table
-- This stores the Discord channel name where client communications happen
-- Example: "ADT | Comunicacion interna"

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS discord_channel_name TEXT DEFAULT NULL;

-- Optional: Add an index if you plan to search by discord channel
CREATE INDEX IF NOT EXISTS idx_clients_discord_channel ON clients(discord_channel_name);

-- Example update for existing clients:
-- UPDATE clients SET discord_channel_name = 'ADT | Comunicacion interna' WHERE business_name = 'ADT';
