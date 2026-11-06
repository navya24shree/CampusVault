create table if not exists public.campus_email_domains (
  domain text primary key check (domain = lower(btrim(domain)) and position('@' in domain) = 0),
  campus_id uuid not null references public.campuses (id) on delete cascade
);

create table if not exists public.faculty_email_allowlist (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.campus_email_domains enable row level security;
alter table public.faculty_email_allowlist enable row level security;
revoke all on public.campus_email_domains, public.faculty_email_allowlist from anon, authenticated;

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

update public.profiles p
set campus_id = case when u.email_confirmed_at is not null then d.campus_id else null end,
    role = case when u.email_confirmed_at is not null and exists (
      select 1 from public.faculty_email_allowlist f
      where f.email = lower(u.email) and f.campus_id = d.campus_id
    ) then 'teacher' else 'student' end
from auth.users u
join public.campus_email_domains d
  on d.domain = split_part(lower(coalesce(u.email, '')), '@', 2)
where p.id = u.id;