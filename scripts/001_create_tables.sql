-- MDK Workspace Database Schema
-- Profiles table - Users of the system
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('direccion', 'project_manager', 'account_manager', 'consultor')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table - Agency clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_lastname TEXT,
  phone TEXT,
  status TEXT CHECK (status IN ('verde', 'amarillo', 'naranja', 'rojo')),
  notion_id TEXT,
  fee_mdk DECIMAL(15,2),
  fee_aurelia DECIMAL(15,2),
  google_ads_customer_id TEXT,
  meta_ads_account_id TEXT,
  plan TEXT DEFAULT NULL CHECK (plan IS NULL OR plan IN ('Esencial', 'Estratégico')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ads Accounts mapping (stores account names for Google Ads and Meta Ads)
CREATE TABLE IF NOT EXISTS ads_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta_ads')),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, platform, account_id)
);

-- User-Client access relationship
CREATE TABLE IF NOT EXISTS user_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  access_level TEXT DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);

-- Ad campaigns from Meta/Google
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  external_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  objective TEXT,
  budget DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily campaign metrics
CREATE TABLE IF NOT EXISTS ad_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(15,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue DECIMAL(15,2) DEFAULT 0,
  cpc DECIMAL(10,4),
  ctr DECIMAL(10,4),
  roas DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  content JSONB,
  type TEXT CHECK (type IN ('weekly', 'monthly', 'scorecard', 'analysis')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  client_id UUID REFERENCES clients(id),
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Direccion can see all profiles
CREATE POLICY "profiles_direccion_select_all" ON profiles FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion')
);

-- Clients policies - users see only clients they have access to
CREATE POLICY "clients_select_assigned" ON clients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_client_access 
    WHERE user_id = auth.uid() AND client_id = clients.id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

-- Ads accounts - view if you have access to the client
CREATE POLICY "ads_accounts_select" ON ads_accounts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_client_access 
    WHERE user_id = auth.uid() AND client_id = ads_accounts.client_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

-- User client access policies
CREATE POLICY "user_client_access_select" ON user_client_access FOR SELECT
USING (user_id = auth.uid());

-- Ad campaigns - view if you have access to the client
CREATE POLICY "ad_campaigns_select" ON ad_campaigns FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_client_access 
    WHERE user_id = auth.uid() AND client_id = ad_campaigns.client_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

-- Ad insights - view if you have access to the campaign's client
CREATE POLICY "ad_insights_select" ON ad_insights FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ad_campaigns ac
    JOIN user_client_access uca ON uca.client_id = ac.client_id
    WHERE ac.id = ad_insights.campaign_id AND uca.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

-- Reports policies
CREATE POLICY "reports_select" ON reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_client_access 
    WHERE user_id = auth.uid() AND client_id = reports.client_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

CREATE POLICY "reports_insert" ON reports FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "reports_update" ON reports FOR UPDATE
USING (auth.uid() = created_by);

-- Activity log policies
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT
USING (
  user_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM user_client_access 
    WHERE user_id = auth.uid() AND client_id = activity_log.client_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'direccion'
  )
);

CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(new.raw_user_meta_data ->> 'role', 'consultor')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_user_client_access_user ON user_client_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_client_access_client ON user_client_access(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_client ON ad_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_campaign ON ad_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_date ON ad_insights(date);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
