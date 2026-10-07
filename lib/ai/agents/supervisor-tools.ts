// Tools que el supervisor siempre expone, aunque no tengan fila habilitada en ai_agent_tools.
export const SUPERVISOR_REQUIRED_TOOL_KEYS = [
  'get_account_context',
  'get_google_metrics',
  'get_meta_metrics',
  'get_industry_benchmark',
  'get_crm_context',
  'get_google_analytics_report',
  'get_google_analytics_sales',
  'crm_sales_attribution',
  'crm_opportunities',
  'crm_contacts',
  'crm_contact_ads',
  'crm_appointments',
  'get_claude_design_prompt',
] as const
