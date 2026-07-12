import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

try {
  const supabaseUrl = required("SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const login = process.env.ADMIN_LOGIN || "sysadmin";
  const password = required("ADMIN_PASSWORD");
  const authDomain = process.env.AUTH_INTERNAL_DOMAIN || "auth.tahfeez.local";

  if (login !== "sysadmin") throw new Error("ADMIN_LOGIN must be sysadmin.");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must contain at least 10 characters.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email: `${login}@${authDomain}`,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "System Administrator" },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new Error("The sysadmin account already exists. Use the admin dashboard to manage accounts.");
    }
    throw error;
  }

  console.log(`Created ${login} administrator (${data.user.id}).`);
  console.log("Remove ADMIN_PASSWORD from your shell or local environment file after setup.");
} catch (error) {
  console.error("Full error:", error);
  process.exitCode = 1;
}

