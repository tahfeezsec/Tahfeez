export type UserRole = "student" | "muhaffiz" | "admin";
export type ManagedRole = Exclude<UserRole, "admin">;

export interface Profile {
  id: string;
  its_id: string | null;
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  marhala: string | null;
  program: string | null;
  created_at: string;
}

export interface UserField {
  id: string;
  target_role: ManagedRole;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select";
  select_options: string[];
  is_required: boolean;
}

export interface ManagedUser extends Profile {
  profile_field_values: Array<{
    field_id: string;
    value: string | number | boolean | null;
  }>;
}

export interface AdminDirectory {
  users: ManagedUser[];
  fields: UserField[];
}

