-- Tahfeez database schema and access controls.
-- Apply through the Supabase CLI or paste into the Supabase SQL editor.

create type public.app_role as enum ('student', 'muhaffiz', 'admin');
create type public.custom_field_type as enum ('text', 'number', 'date', 'select');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  its_id varchar(8) unique,
  role public.app_role not null,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_its_id_format check (
    (role = 'admin' and its_id is null)
    or (role in ('student', 'muhaffiz') and its_id ~ '^[0-9]{8}$')
  ),
  constraint profiles_full_name_length check (char_length(full_name) between 2 and 120),
  constraint profiles_email_format check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

create table public.user_fields (
  id uuid primary key default gen_random_uuid(),
  target_role public.app_role not null,
  field_key text not null,
  label text not null,
  field_type public.custom_field_type not null default 'text',
  select_options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint user_fields_managed_roles_only check (target_role in ('student', 'muhaffiz')),
  constraint user_fields_key_format check (field_key ~ '^[a-z][a-z0-9_]{0,49}$'),
  constraint user_fields_label_length check (char_length(label) between 2 and 60),
  constraint user_fields_options_array check (jsonb_typeof(select_options) = 'array'),
  constraint user_fields_select_options check (
    (field_type = 'select' and jsonb_array_length(select_options) between 1 and 30)
    or (field_type <> 'select' and select_options = '[]'::jsonb)
  ),
  unique (target_role, field_key)
);

create table public.profile_field_values (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  field_id uuid not null references public.user_fields(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, field_id),
  constraint profile_field_values_scalar check (jsonb_typeof(value) in ('string', 'number', 'boolean', 'null'))
);

create index profiles_role_idx on public.profiles(role);
create index profile_field_values_field_id_idx on public.profile_field_values(field_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger profile_field_values_set_updated_at
before update on public.profile_field_values
for each row execute procedure public.set_updated_at();

-- Only service-role account creation is accepted. This blocks public self-sign-up
-- even if the hosted project's signup setting is changed accidentally.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_app_meta_data ->> 'role';
  assigned_role public.app_role;
  requested_its_id text := new.raw_app_meta_data ->> 'its_id';
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  requested_email text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'public_email', '')), '');
begin
  if requested_role not in ('student', 'muhaffiz', 'admin') then
    raise exception 'Tahfeez accounts may only be created by an administrator.';
  end if;

  assigned_role := requested_role::public.app_role;

  if assigned_role = 'admin' then
    requested_its_id := null;
  elsif requested_its_id !~ '^[0-9]{8}$' then
    raise exception 'A managed account requires an 8 digit ITS ID.';
  end if;

  if char_length(requested_name) not between 2 and 120 then
    raise exception 'A full name is required.';
  end if;

  if requested_email is not null and requested_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The public email is invalid.';
  end if;

  insert into public.profiles (id, its_id, role, full_name, phone, email)
  values (new.id, requested_its_id, assigned_role, requested_name, requested_phone, requested_email);

  return new;
end;
$$;

create trigger auth_user_profile_trigger
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.validate_profile_field_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role public.app_role;
  field_role public.app_role;
  field_kind public.custom_field_type;
  allowed_options jsonb;
begin
  select role into profile_role from public.profiles where id = new.profile_id;
  select target_role, field_type, select_options
  into field_role, field_kind, allowed_options
  from public.user_fields where id = new.field_id;

  if profile_role is null or field_role is null or profile_role <> field_role then
    raise exception 'The custom field does not belong to this account type.';
  end if;

  if field_kind = 'number' and jsonb_typeof(new.value) not in ('number', 'string') then
    raise exception 'This custom field expects a number.';
  end if;

  if field_kind = 'select' and not (allowed_options ? (new.value #>> '{}')) then
    raise exception 'The selected value is not allowed for this field.';
  end if;

  return new;
end;
$$;

create trigger profile_field_values_validate
before insert or update on public.profile_field_values
for each row execute procedure public.validate_profile_field_value();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_fields enable row level security;
alter table public.profile_field_values enable row level security;

revoke all on public.profiles, public.user_fields, public.profile_field_values from anon, authenticated;
grant select on public.profiles, public.user_fields, public.profile_field_values to authenticated;
grant execute on function public.is_admin() to authenticated;

create policy "profiles_read_own_or_admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "user_fields_read_authenticated"
on public.user_fields for select to authenticated
using (true);

create policy "field_values_read_own_or_admin"
on public.profile_field_values for select to authenticated
using (profile_id = auth.uid() or public.is_admin());

-- No INSERT, UPDATE, or DELETE policies are granted to clients. The service-role
-- Edge Function below performs all administrative changes after verifying the JWT.

