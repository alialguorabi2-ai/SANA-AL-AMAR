-- SANA AL-AMAR | course administration security
-- All changes preserve currently published public content and existing rows.
-- Authorize staff using Supabase Auth app_metadata, never user_metadata.
create or replace function public.sana_is_staff()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt()->'app_metadata'->>'sana_role'), '') in ('admin', 'editor');
$$;
revoke all on function public.sana_is_staff() from PUBLIC, anon;
grant execute on function public.sana_is_staff() to authenticated;

-- courses: preserve existing published read policies, add staff-only draft reads/writes.
alter table public.courses enable row level security;
revoke all privileges on table public.courses from anon, authenticated;
grant select on table public.courses to anon, authenticated;
grant insert, update on table public.courses to authenticated;
drop policy if exists sana_staff_select on public.courses;
create policy sana_staff_select on public.courses for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_insert on public.courses;
create policy sana_staff_insert on public.courses for insert to authenticated with check ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.courses;
create policy sana_staff_update on public.courses for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- course_year_offerings: preserve existing published read policies, add staff-only draft reads/writes.
alter table public.course_year_offerings enable row level security;
revoke all privileges on table public.course_year_offerings from anon, authenticated;
grant select on table public.course_year_offerings to anon, authenticated;
grant insert, update on table public.course_year_offerings to authenticated;
drop policy if exists sana_staff_select on public.course_year_offerings;
create policy sana_staff_select on public.course_year_offerings for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_insert on public.course_year_offerings;
create policy sana_staff_insert on public.course_year_offerings for insert to authenticated with check ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.course_year_offerings;
create policy sana_staff_update on public.course_year_offerings for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- departments: preserve existing published read policies, add staff-only draft reads/writes.
alter table public.departments enable row level security;
revoke all privileges on table public.departments from anon, authenticated;
grant select on table public.departments to anon, authenticated;
grant insert, update on table public.departments to authenticated;
drop policy if exists sana_staff_select on public.departments;
create policy sana_staff_select on public.departments for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_insert on public.departments;
create policy sana_staff_insert on public.departments for insert to authenticated with check ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.departments;
create policy sana_staff_update on public.departments for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- course_media: preserve existing published read policies, add staff-only draft reads/writes.
alter table public.course_media enable row level security;
revoke all privileges on table public.course_media from anon, authenticated;
grant select on table public.course_media to anon, authenticated;
grant insert, update on table public.course_media to authenticated;
drop policy if exists sana_staff_select on public.course_media;
create policy sana_staff_select on public.course_media for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_insert on public.course_media;
create policy sana_staff_insert on public.course_media for insert to authenticated with check ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.course_media;
create policy sana_staff_update on public.course_media for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- course_certificates: preserve existing published read policies, add staff-only draft reads/writes.
alter table public.course_certificates enable row level security;
revoke all privileges on table public.course_certificates from anon, authenticated;
grant select on table public.course_certificates to anon, authenticated;
grant insert, update on table public.course_certificates to authenticated;
drop policy if exists sana_staff_select on public.course_certificates;
create policy sana_staff_select on public.course_certificates for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_insert on public.course_certificates;
create policy sana_staff_insert on public.course_certificates for insert to authenticated with check ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.course_certificates;
create policy sana_staff_update on public.course_certificates for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- Public registration submission stays possible under existing restrictive insert policy.
-- Reading or updating registration data is reserved exclusively for staff.
alter table public.registration_requests enable row level security;
revoke all privileges on table public.registration_requests from anon, authenticated;
grant insert on table public.registration_requests to anon, authenticated;
grant select, update on table public.registration_requests to authenticated;
drop policy if exists sana_staff_select on public.registration_requests;
create policy sana_staff_select on public.registration_requests for select to authenticated using ((select public.sana_is_staff()));
drop policy if exists sana_staff_update on public.registration_requests;
create policy sana_staff_update on public.registration_requests for update to authenticated using ((select public.sana_is_staff())) with check ((select public.sana_is_staff()));

-- Support 'new' -> 'confirmed' -> 'completed' without losing legacy valid statuses.
alter table public.registration_requests drop constraint if exists registration_requests_status_check;
alter table public.registration_requests add constraint registration_requests_status_check
  check (status in ('new','contacted','confirmed','completed','cancelled','rejected'));

-- Publish annual offering and course together or roll back both.
create or replace function public.sana_set_course_publication(
  p_course_id bigint, p_is_published boolean, p_offering_id bigint default null
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_rows integer;
begin
  if not public.sana_is_staff() then
    raise exception 'staff access required' using errcode = '42501';
  end if;
  if p_course_id is null or p_is_published is null then
    raise exception 'course id and publication state required' using errcode = '22023';
  end if;
  if p_is_published then
    if p_offering_id is null then
      raise exception 'annual offering required before publication' using errcode = '22023';
    end if;
    update public.course_year_offerings
      set is_published = true, updated_at = now()
      where id = p_offering_id and course_id = p_course_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'annual offering not found' using errcode = '22023'; end if;
  else
    update public.course_year_offerings
      set is_published = false, updated_at = now()
      where course_id = p_course_id;
  end if;
  update public.courses set is_published = p_is_published, updated_at = now()
    where id = p_course_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'course not found' using errcode = '22023'; end if;
  return true;
end;
$$;
revoke all on function public.sana_set_course_publication(bigint, boolean, bigint) from PUBLIC, anon;
grant execute on function public.sana_set_course_publication(bigint, boolean, bigint) to authenticated;

create index if not exists sana_courses_published_order_idx
  on public.courses (sort_order, created_at desc) where is_published = true;
create index if not exists sana_offerings_course_published_idx
  on public.course_year_offerings (course_id) where is_published = true;
