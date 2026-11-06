create extension if not exists pgcrypto;

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_email_domains (
  domain text primary key check (domain = lower(btrim(domain)) and position('@' in domain) = 0),
  campus_id uuid not null references public.campuses (id) on delete cascade
);

create table if not exists public.faculty_email_allowlist (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher')),
  campus_id uuid references public.campuses (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  course_code text not null check (char_length(course_code) between 1 and 20),
  course_title text not null check (char_length(course_title) between 1 and 100),
  category text not null check (category in ('Previous year', 'IA papers', 'Notes', 'Other')),
  academic_year text not null check (char_length(academic_year) between 1 and 20),
  semester smallint not null check (semester between 1 and 10),
  description text not null default '' check (char_length(description) <= 280),
  file_name text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  storage_path text not null unique,
  download_count bigint not null default 0 check (download_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists resources_campus_created_idx on public.resources (campus_id, created_at desc);
create index if not exists resources_campus_course_idx on public.resources (campus_id, course_code);

create or replace function public.create_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_campus uuid;
  assigned_role text := 'student';
  normalized_email text := lower(coalesce(new.email, ''));
begin
  if new.email_confirmed_at is not null then
    select d.campus_id into assigned_campus
    from public.campus_email_domains d
    where d.domain = split_part(normalized_email, '@', 2);
  end if;

  if assigned_campus is not null and exists (
    select 1 from public.faculty_email_allowlist f
    where f.email = normalized_email and f.campus_id = assigned_campus
  ) then
    assigned_role := 'teacher';
  end if;

  insert into public.profiles (id, full_name, role, campus_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    assigned_role,
    assigned_campus
  )
  on conflict (id) do update
  set role = excluded.role, campus_id = excluded.campus_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_student_profile();

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.create_student_profile();

create or replace function public.sync_profile_for_email(target_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set campus_id = case when u.email_confirmed_at is not null then d.campus_id else null end,
      role = case when u.email_confirmed_at is not null and exists (
        select 1 from public.faculty_email_allowlist f
        where f.email = lower(u.email) and f.campus_id = d.campus_id
      ) then 'teacher' else 'student' end
  from auth.users u
  left join public.campus_email_domains d
    on d.domain = split_part(lower(coalesce(u.email, '')), '@', 2)
  where p.id = u.id and lower(u.email) = lower(target_email);
end;
$$;

create or replace function public.sync_profiles_for_faculty_allowlist_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_profile_for_email(old.email);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_profile_for_email(new.email);
  end if;
  return null;
end;
$$;

create or replace function public.sync_profiles_for_campus_domain_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_domain text;
  affected_user record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    changed_domain := old.domain;
    for affected_user in
      select email from auth.users
      where split_part(lower(coalesce(email, '')), '@', 2) = changed_domain
    loop
      perform public.sync_profile_for_email(affected_user.email);
    end loop;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    changed_domain := new.domain;
    for affected_user in
      select email from auth.users
      where split_part(lower(coalesce(email, '')), '@', 2) = changed_domain
    loop
      perform public.sync_profile_for_email(affected_user.email);
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_profile_for_email(text) from public, anon, authenticated;
revoke all on function public.sync_profiles_for_faculty_allowlist_change() from public, anon, authenticated;
revoke all on function public.sync_profiles_for_campus_domain_change() from public, anon, authenticated;

drop trigger if exists sync_faculty_allowlist_profiles on public.faculty_email_allowlist;
create trigger sync_faculty_allowlist_profiles
  after insert or update or delete on public.faculty_email_allowlist
  for each row execute function public.sync_profiles_for_faculty_allowlist_change();

drop trigger if exists sync_campus_domain_profiles on public.campus_email_domains;
create trigger sync_campus_domain_profiles
  after insert or update or delete on public.campus_email_domains
  for each row execute function public.sync_profiles_for_campus_domain_change();

create or replace function public.is_campus_teacher(target_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and campus_id = target_campus
      and role = 'teacher'
  );
$$;

alter table public.campuses enable row level security;
alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.campus_email_domains enable row level security;
alter table public.faculty_email_allowlist enable row level security;
revoke all on public.campus_email_domains, public.faculty_email_allowlist from anon, authenticated;

drop policy if exists "Members can view their campus" on public.campuses;
create policy "Members can view their campus" on public.campuses
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.campus_id = campuses.id));

drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "Members can update their display name" on public.profiles;
create policy "Members can update their display name" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.campuses, public.profiles, public.resources to authenticated;
grant insert, update, delete on public.resources to authenticated;

drop policy if exists "Campus members can view resources" on public.resources;
create policy "Campus members can view resources" on public.resources
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.campus_id = resources.campus_id));

drop policy if exists "Teachers can add campus resources" on public.resources;
create policy "Teachers can add campus resources" on public.resources
  for insert to authenticated
  with check (public.is_campus_teacher(campus_id) and uploaded_by = (select auth.uid()));

drop policy if exists "Teachers can update campus resources" on public.resources;
create policy "Teachers can update campus resources" on public.resources
  for update to authenticated
  using (public.is_campus_teacher(campus_id))
  with check (public.is_campus_teacher(campus_id) and uploaded_by = (select auth.uid()));

drop policy if exists "Teachers can delete campus resources" on public.resources;
create policy "Teachers can delete campus resources" on public.resources
  for delete to authenticated
  using (public.is_campus_teacher(campus_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-resources', 'campus-resources', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png'
])
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "Campus members can download files" on storage.objects;
create policy "Campus members can download files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'campus-resources'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.campus_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Campus teachers can upload files" on storage.objects;
create policy "Campus teachers can upload files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'campus-resources'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'teacher'
        and p.campus_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Campus teachers can delete files" on storage.objects;
create policy "Campus teachers can delete files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'campus-resources'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'teacher'
        and p.campus_id::text = (storage.foldername(name))[1]
    )
  );

create or replace function public.increment_resource_download(resource_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.resources r
  set download_count = r.download_count + 1
  where r.id = resource_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.campus_id = r.campus_id
    );
$$;

grant execute on function public.increment_resource_download(uuid) to authenticated;

-- Create a campus in the dashboard, then assign approved users by email.
-- Set role to 'teacher' only for faculty accounts; all other members stay students.
-- update public.profiles
-- set campus_id = '<campus-uuid>', role = 'teacher'
-- where id = (select id from auth.users where email = 'faculty@college.edu');