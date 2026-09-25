import type { User } from "./models";

export interface UserServiceLink {
  id: string;
  name: string;
  status: string;
  is_active: boolean;
  category_name: string | null;
}

export interface UserHardwareAssetLink {
  id: string;
  model_name: string;
  serial_number: string | null;
  hardware_type: import("./models").HardwareType;
  quantity: number;
  status: string;
  is_active: boolean;
  hardware_location_name: string | null;
}

export interface UserProfile {
  user: User;
  owned_services: UserServiceLink[];
  assigned_services: UserServiceLink[];
  assigned_hardware_assets: UserHardwareAssetLink[];
}

export interface UserDetailOutletContext {
  profile: UserProfile;
}
