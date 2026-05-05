-- Create client_comments table for client notes/comments
CREATE TABLE IF NOT EXISTS client_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all comments for clients they have access to
CREATE POLICY "Users can view client comments" 
  ON client_comments FOR SELECT 
  USING (true);

-- Policy: Users can insert their own comments
CREATE POLICY "Users can insert own comments" 
  ON client_comments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own comments
CREATE POLICY "Users can delete own comments" 
  ON client_comments FOR DELETE 
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_client_comments_client_id ON client_comments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_comments_created_at ON client_comments(created_at DESC);
