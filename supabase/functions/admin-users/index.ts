import { createClient } from "npm:@supabase/supabase-js@2";

type ManagedRole = "student" | "muhaffiz";
type FieldType = "text" | "number" | "date" | "select";
type RequestBody = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function response(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertRecord(value: unknown): RequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("Invalid request body.");
  }
  return value as RequestBody;
}

function requiredText(value: unknown, label: string, min = 1, max = 120) {
  if (typeof value !== "string") throw new ApiError(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(`${label} must contain between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max = 160) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, 1, max);
}

function managedRole(value: unknown): ManagedRole {
  if (value !== "student" && value !== "muhaffiz") {
    throw new ApiError("Account type must be student or Muhaffiz.");
  }
  return value;
}

function userId(value: unknown) {
  const id = requiredText(value, "User ID", 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError("User ID is invalid.");
  }
  return id;
}

function itsId(value: unknown) {
  const id = requiredText(value, "ITS ID", 8, 8);
  if (!/^\d{8}$/.test(id)) throw new ApiError("ITS ID must contain exactly 8 digits.");
  return id;
}

function password(value: unknown) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) {
    throw new ApiError("Password must contain between 10 and 128 characters.");
  }
  return value;
}

function email(value: unknown) {
  const result = optionalText(value, "Email", 160);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new ApiError("Email is invalid.");
  }
  return result;
}

function customValues(value: unknown) {
  if (value === undefined || value === null) return {} as Record<string, string>;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("Custom field values are invalid.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([fieldId, fieldValue]) => !userId(fieldId) || typeof fieldValue !== "string" || fieldValue.length > 500)) {
    throw new ApiError("A custom field value is invalid.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function fieldType(value: unknown): FieldType {
  if (value !== "text" && value !== "number" && value !== "date" && value !== "select") {
    throw new ApiError("Custom field type is invalid.");
  }
  return value;
}

function selectOptions(value: unknown, isSelect: boolean) {
  if (!isSelect) return [];
  if (!Array.isArray(value)) throw new ApiError("Choice fields need at least one option.");
  const options = [...new Set(value.map((option) => requiredText(option, "Choice", 1, 60)))];
  if (options.length === 0 || options.length > 30) {
    throw new ApiError("Choice fields need between 1 and 30 options.");
  }
  return options;
}

function fieldKey(label: string) {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "");
  return (key || "custom_field").slice(0, 42);
}

function valueForField(value: string, kind: FieldType) {
  if (kind === "number") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) throw new ApiError("A number custom field has an invalid value.");
    return numericValue;
  }
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      throw new ApiError("Unauthorized.", 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new ApiError("Unauthorized.", 401);

    const { data: administrator, error: administratorError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();
    if (administratorError || administrator?.role !== "admin") {
      throw new ApiError("Administrator access is required.", 403);
    }

    const body = assertRecord(await request.json());
    const action = requiredText(body.action, "Action", 3, 32);

    if (action === "list") {
      const role = managedRole(body.role);
      const [{ data: users, error: usersError }, { data: fields, error: fieldsError }] = await Promise.all([
        adminClient
          .from("profiles")
          .select("id, its_id, role, full_name, phone, email, created_at, profile_field_values(field_id, value)")
          .eq("role", role)
          .order("full_name"),
        adminClient
          .from("user_fields")
          .select("id, target_role, field_key, label, field_type, select_options, is_required")
          .eq("target_role", role)
          .order("created_at"),
      ]);
      if (usersError || fieldsError) throw new ApiError("Unable to load the directory.", 500);
      return response({ users, fields });
    }

    if (action === "create") {
      const role = managedRole(body.role);
      const accountItsId = itsId(body.itsId);
      const accountPassword = password(body.password);
      const fullName = requiredText(body.fullName, "Full name", 2, 120);
      const phone = optionalText(body.phone, "Phone number", 40);
      const publicEmail = email(body.email);
      const submittedValues = customValues(body.customValues);
      const { data: fields, error: fieldsError } = await adminClient
        .from("user_fields")
        .select("id, field_type, select_options, is_required")
        .eq("target_role", role);
      if (fieldsError) throw new ApiError("Unable to validate custom fields.", 500);

      const fieldMap = new Map((fields || []).map((field) => [field.id, field]));
      if (Object.keys(submittedValues).some((fieldId) => !fieldMap.has(fieldId))) {
        throw new ApiError("A custom field is no longer available. Refresh and try again.");
      }
      for (const field of fields || []) {
        const submittedValue = submittedValues[field.id];
        if (field.is_required && !submittedValue?.trim()) {
          throw new ApiError("Please complete every required custom field.");
        }
        if (field.field_type === "select" && submittedValue && !field.select_options.includes(submittedValue)) {
          throw new ApiError("A selected custom field value is invalid.");
        }
        if (field.field_type === "number" && submittedValue) valueForField(submittedValue, "number");
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: `${accountItsId}@${Deno.env.get("AUTH_INTERNAL_DOMAIN") || "auth.tahfeez.local"}`,
        password: accountPassword,
        email_confirm: true,
        app_metadata: { role, its_id: accountItsId },
        user_metadata: { full_name: fullName, phone, public_email: publicEmail },
      });
      if (createError || !created.user) {
        if (createError?.message.toLowerCase().includes("already")) {
          throw new ApiError("An account with that ITS ID already exists.");
        }
        console.error("Account creation error", createError);
        throw new ApiError("Unable to create this account.", 500);
      }

      const values = (fields || [])
        .filter((field) => submittedValues[field.id]?.trim())
        .map((field) => ({
          profile_id: created.user.id,
          field_id: field.id,
          value: valueForField(submittedValues[field.id], field.field_type as FieldType),
        }));
      if (values.length > 0) {
        const { error: valueError } = await adminClient.from("profile_field_values").insert(values);
        if (valueError) {
          await adminClient.auth.admin.deleteUser(created.user.id);
          throw new ApiError("Unable to save the custom fields. The account was not created.", 500);
        }
      }
      return response({ id: created.user.id }, 201);
    }

    if (action === "create_field") {
      const role = managedRole(body.role);
      const label = requiredText(body.label, "Field label", 2, 60);
      const kind = fieldType(body.fieldType);
      const options = selectOptions(body.selectOptions, kind === "select");
      const isRequired = body.isRequired === true;
      const baseKey = fieldKey(label);

      let insertedField: unknown = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidateKey = attempt === 0 ? baseKey : `${baseKey.slice(0, 38)}_${attempt + 1}`;
        const { data, error: insertError } = await adminClient
          .from("user_fields")
          .insert({ target_role: role, field_key: candidateKey, label, field_type: kind, select_options: options, is_required: isRequired })
          .select("id, target_role, field_key, label, field_type, select_options, is_required")
          .single();
        if (!insertError) {
          insertedField = data;
          break;
        }
        if (insertError.code !== "23505") {
          console.error("Custom field creation error", insertError);
          throw new ApiError("Unable to create the custom field.", 500);
        }
      }
      if (!insertedField) throw new ApiError("A field with a similar name already exists.");
      return response({ field: insertedField }, 201);
    }

    if (action === "reset_password" || action === "delete") {
      const managedUserId = userId(body.userId);
      const { data: target, error: targetError } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", managedUserId)
        .single();
      if (targetError || (target?.role !== "student" && target?.role !== "muhaffiz")) {
        throw new ApiError("Managed account not found.", 404);
      }

      if (action === "reset_password") {
        const { error: updateError } = await adminClient.auth.admin.updateUserById(managedUserId, { password: password(body.password) });
        if (updateError) throw new ApiError("Unable to reset the password.", 500);
        return response({ success: true });
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(managedUserId);
      if (deleteError) throw new ApiError("Unable to remove the account.", 500);
      return response({ success: true });
    }

    throw new ApiError("Unknown action.");
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error("Unhandled admin-users error", error);
    return response({ error: "Unable to process the request." }, 500);
  }
});
