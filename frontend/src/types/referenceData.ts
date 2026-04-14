export type ReferenceDataInputType = "text" | "textarea" | "url" | "badge_preset";

export interface ReferenceDataField {
  key: string;
  label: string;
  input_type: ReferenceDataInputType;
  required: boolean;
  show_in_list: boolean;
  placeholder: string | null;
  help_text: string | null;
}

export interface ReferenceDataResource {
  key: string;
  label: string;
  plural_label: string;
  description: string;
  api_path: string;
  settings_path: string;
  search_fields: string[];
  fields: ReferenceDataField[];
}

export interface ReferenceDataRecord {
  id: string;
  [key: string]: string | null | undefined;
}
