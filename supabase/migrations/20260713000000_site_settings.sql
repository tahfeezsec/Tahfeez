create table public.site_settings (
  id integer primary key check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- Everyone can read site settings
create policy "site_settings_read_all"
on public.site_settings for select
using (true);

-- Only admins can update site settings
create policy "site_settings_update_admin"
on public.site_settings for update to authenticated
using (public.is_admin());

-- Insert default row
insert into public.site_settings (id, settings)
values (1, '{
  "fontFamily": "Inter, sans-serif",
  "loginWallpaper": "/wallpaper.jpg",
  "wallpaperAlignment": "center",
  "wallpaperSize": "contain",
  "loginPanelJustify": "flex-start",
  "loginTitle": "Sign in to Tahfeez",
  "loginSubtitle": "Use the ITS ID and password issued by your administrator."
}'::jsonb);

create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute procedure public.set_updated_at();
