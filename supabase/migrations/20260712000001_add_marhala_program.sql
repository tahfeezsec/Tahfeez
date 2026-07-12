-- Migration to add marhala and program columns and update trigger
alter table public.profiles add column if not exists marhala text;
alter table public.profiles add column if not exists program text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role');
  assigned_role public.app_role;
  requested_its_id text := coalesce(new.raw_app_meta_data ->> 'its_id', new.raw_user_meta_data ->> 'its_id');
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  requested_email text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'public_email', '')), '');
  requested_marhala text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'marhala', '')), '');
  requested_program text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'program', '')), '');
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

  insert into public.profiles (id, its_id, role, full_name, phone, email, marhala, program)
  values (
    new.id,
    requested_its_id,
    assigned_role,
    requested_name,
    requested_phone,
    requested_email,
    case when assigned_role = 'student' then requested_marhala else null end,
    case when assigned_role = 'student' then requested_program else null end
  );

  return new;
end;
$$;
