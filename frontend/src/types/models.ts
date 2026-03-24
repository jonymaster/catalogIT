export interface User {
  id: string;
  external_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  status: string;
  license_type: string;
  category: string;
  billing_schedule: string;
  yearly_cost: number | null;
  sso_integrated: boolean;
  automated_provisioning: boolean;
  notes: string | null;
  owners: User[];
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
