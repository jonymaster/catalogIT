export type ProvisioningSource = "local" | "scim" | "oidc";

export interface AdminExportJob {
  id: string;
  status: string;
  include_attachments: boolean;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface UserDirectoryPage {
  items: User[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

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
  receive_renewal_notifications: boolean;
  role: string;
  provisioning_source: ProvisioningSource;
  created_at: string;
  updated_at: string;
  /** Global permission slugs (e.g. financial_view). */
  permissions?: string[];
}

export interface UserPreferences {
  locale: string | null;
  timezone: string | null;
  theme: "light" | "dark";
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
  color: string;
}

export interface CostCenter {
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
  color: string;
}

export interface ServiceStatus {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

export interface HardwareStatus {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

export interface HardwareLocation {
  id: string;
  name: string;
  description: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface ServiceClassification {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
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

export interface CostRecord {
  id: string;
  service_id: string | null;
  laptop_id: string | null;
  payment_method_id: string | null;
  payment_method_name: string | null;
  fiscal_year: number;
  purchase_year: number | null;
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
  description: string | null;
  status: string;
  billing_schedule: string;
  renewal_date: string | null;
  yearly_cost: number | null;
  sso_integrated: boolean;
  point_of_contact: string | null;
  notes: string | null;
  owners: User[];
  assignees: User[];
  total_seats: number | null;
  // Normalized fields
  vendor_id: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  payment_method_id: string | null;
  service_status_id: string | null;
  contract_id: string | null;
  classification_id: string | null;
  scim_enabled: boolean | null;
  criticality: string | null;
  nonprofit_pricing: boolean;
  is_active: boolean;
  renewal_reminders_enabled: boolean;
  renewal_offsets_days: number[] | null;
  deprecated_at: string | null;
  vendor: Vendor | null;
  category_rel: Category | null;
  cost_center: CostCenter | null;
  payment_method: PaymentMethod | null;
  service_status: ServiceStatus | null;
  service_classification: ServiceClassification | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export type OperatingSystem = "macos" | "linux" | "windows";

export interface Laptop {
  id: string;
  serial_number: string;
  model_name: string;
  cpu: string;
  ram: string;
  storage_size: string;
  operating_system: OperatingSystem | null;
  status: string;
  hardware_status_id: string | null;
  hardware_location_id: string | null;
  hardware_status: HardwareStatus | null;
  hardware_location: HardwareLocation | null;
  assigned_to_id: string | null;
  assigned_to: User | null;
  notes: string | null;
  mdm_connected: boolean;
  is_active: boolean;
  archived_at: string | null;
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

export interface PaginatedHistoryResponse {
  items: AuditLogEntry[];
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
}

export interface GlobalAuditEventRow {
  id: string;
  category: string;
  event_type: string;
  entity_table: string | null;
  entity_key: string | null;
  actor: User | null;
  occurred_at: string;
  summary: string | null;
  details: Record<string, unknown> | null;
  request_id: string | null;
}

export interface PaginatedGlobalAudit {
  items: GlobalAuditEventRow[];
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
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

export interface PaginatedAttachments {
  items: Attachment[];
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
}
