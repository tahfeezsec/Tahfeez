# Tahfeez Web Application

A React 19 and Supabase application for secure Hifz community management. It includes:

- a shared Student / Muhaffiz ITS ID login with an account-type toggle;
- a separate `sysadmin` administrator login;
- role-protected Student, Muhaffiz, and Admin dashboards;
- admin pages for creating, resetting, and removing Student and Muhaffiz accounts;
- custom fields per account type; and
- PostgreSQL row-level security plus a server-side Supabase Edge Function for all administration.

## Local development

1. Install Node.js 20 or later, then install project dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy `.env.example` to `.env` and replace both values with **Project Settings → API** values from Supabase.

3. Start the app:

   ```powershell
   npm.cmd run dev
   ```

## Supabase setup

1. Create a Supabase project. Run the SQL in [supabase/migrations/20260712000000_tahfeez_schema.sql](supabase/migrations/20260712000000_tahfeez_schema.sql) in the Supabase SQL Editor, or link the project and run:

   ```powershell
   npx supabase login
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```

2. Deploy the secure admin API. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions; only the internal auth domain needs setting:

   ```powershell
   npx supabase secrets set AUTH_INTERNAL_DOMAIN=auth.tahfeez.local APP_ORIGIN=https://your-domain.example
   npx supabase functions deploy admin-users
   ```

3. Create the initial administrator **after** the SQL migration has run. The server key must stay in your shell or a local, ignored `.env.server` file — never in `.env` or browser code:

   ```powershell
   $env:SUPABASE_URL = "https://your-project-ref.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
   $env:ADMIN_LOGIN = "sysadmin"
   $env:ADMIN_PASSWORD = "tahfeez2026"
   npm.cmd run create:admin
   ```

   Sign in at the Admin page with user ID `sysadmin` and password `tahfeez2026`. Rotate that initial password immediately in Supabase Auth after first access.

4. In **Authentication → Providers**, keep Email enabled and disable new user sign-ups. The database trigger also rejects normal sign-ups, so all production accounts can only be created by the protected `admin-users` function.

## Security model

- User-facing identities are internal aliases: `ITS_ID@auth.tahfeez.local`. The app only accepts an 8-digit ITS ID, never an email address, for Student and Muhaffiz sign-in.
- Password verification, refresh-token rotation, and persistent sessions are managed by Supabase Auth. Password hashes are never copied into public tables.
- The public browser receives only the Supabase anon key. The service-role key exists only in the deployed Edge Function and one-time local bootstrap command.
- Row-level security lets members read only their own profile and custom field values. Clients receive no direct write policy; the Edge Function checks the caller JWT and current `admin` role before every management action.
- The database trigger accepts only account creation carrying trusted `app_metadata` from the service role. This protects against accidental or malicious public self-registration.

Before launch, restrict Supabase Auth redirect URLs to your deployed domain, configure Supabase Auth password strength and leaked-password protection, and keep the database and function dependencies updated. Use `APP_ORIGIN=http://localhost:5173` for local-only testing.
