-- Add INSERT, UPDATE, DELETE policies for clients table
-- Allow direccion and project_manager to manage clients

-- Policy for INSERT - direccion and project_manager can create clients
CREATE POLICY "clients_insert_managers" ON clients FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

-- Policy for UPDATE - direccion and project_manager can update any client
CREATE POLICY "clients_update_managers" ON clients FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

-- Policy for DELETE - only direccion can delete clients
CREATE POLICY "clients_delete_direccion" ON clients FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'direccion'
  )
);

-- Also allow direccion and project_manager to see ALL clients (not just assigned)
CREATE POLICY "clients_select_managers_all" ON clients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

-- Allow direccion and project_manager to manage user_client_access
CREATE POLICY "user_client_access_insert_managers" ON user_client_access FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

CREATE POLICY "user_client_access_update_managers" ON user_client_access FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

CREATE POLICY "user_client_access_delete_managers" ON user_client_access FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);

-- Allow managers to see all user_client_access records
CREATE POLICY "user_client_access_select_managers" ON user_client_access FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('direccion', 'project_manager')
  )
);
