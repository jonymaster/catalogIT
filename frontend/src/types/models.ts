export interface User {
  id: string;
  external_id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  department: string | null;
  locale: string | null;
  timezone: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  locale: string | null;
  timezone: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface LoginMethod {
  id: string;
  name: string;
  description: string | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
  method_type: string;
  last_four: string | null;
  notes: string | null;
}

export interface ServiceStatus {
  id: string;
  name: string;
  description: string | null;
}

export interface Contract {
  id: string;
  vendor_id: string;
  contract_ref: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_renew: boolean;
  total_value: number | null;
  terms_notes: string | null;
  vendor?: Vendor;
  created_at: string;
  updated_at: string;
}

export interface ServiceLogin {
  id: string;
  login_method_id: string;
  is_primary: boolean;
  login_method?: LoginMethod;
}

export interface CostRecord {
  id: string;
  service_id: string;
  payment_method_id: string | null;
  payment_method_name: string | null;
  fiscal_year: number;
  amount: number;
  record_type: "actual" | "estimated" | "budget";
  notes: string | null;
  recorded_at: string;
  recorded_by_id: string | null;
  recorded_by_name: string | null;
}

export interface ServiceHistoryEntry {
  id: string;
  service_id: string;
  action_date: string;
  action_type: string;
  description: string | null;
  changed_by_id: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  status: string;
  license_type: string;
  category: string;
  billing_schedule: string;
  renewal_date: string | null;
  yearly_cost: number | null;
  sso_integrated: boolean;
  automated_provisioning: boolean;
  notes: string | null;
  owners: User[];
  // Normalized fields
  vendor_id: string | null;
  category_id: string | null;
  payment_method_id: string | null;
  service_status_id: string | null;
  contract_id: string | null;
  classification: string | null;
  service_type: string | null;
  scim_enabled: boolean | null;
  scim_notes: string | null;
  criticality: string | null;
  nonprofit_pricing: boolean;
  is_active: boolean;
  deprecated_at: string | null;
  vendor: Vendor | null;
  category_rel: Category | null;
  service_status: ServiceStatus | null;
  logins: ServiceLogin[];
  created_at: string;
  updated_at: string;
}

export interface Laptop {
  id: string;
  serial_number: string;
  model_name: string;
  cpu: string;
  ram: string;
  storage_size: string;
  status: string;
  assigned_to_id: string | null;
  assigned_to: User | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: User | null;
  timestamp: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

export interface OidcConfig {
  provider_name: string;
  issuer_url: string;
  client_id: string;
  scopes: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandingInfo {
  logo_url: string | null;
  logo_filename: string | null;
  updated_at: string | null;
}

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  created_by_id: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_revoked: boolean;
}

export interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  uploaded_by_id: string | null;
  created_at: string;
}
