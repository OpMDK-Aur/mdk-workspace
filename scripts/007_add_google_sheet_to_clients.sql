-- Add google_sheet_id column to clients table
-- This stores the Google Spreadsheet ID for each client

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS google_sheet_id TEXT DEFAULT NULL;

-- Add a comment to document the column
COMMENT ON COLUMN clients.google_sheet_id IS 'Google Spreadsheet ID linked to this client for data sync';
