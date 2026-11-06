# CampusVault

A college resource library for previous-year papers, internal assessment papers, notes, and other course materials. Built with React, TypeScript, Vite, and Supabase.

## Run locally

```sh
npm install
npm run dev
```

Without Supabase credentials the app opens a preview workspace with sample resources. Uploads and saved items in preview mode stay in browser memory.

## Connect Supabase

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project API settings. Never put a service-role key in a frontend environment file.
3. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. If you already ran the previous schema, run [`supabase/onboarding.sql`](supabase/onboarding.sql) instead to add automatic account assignment.
4. Create a campus in `public.campuses`, then add its email domain and campus ID to `public.campus_email_domains` using the Supabase Table Editor. New signups with a confirmed email at that domain are automatically assigned as students at that campus.
5. Add faculty addresses to `public.faculty_email_allowlist` in the Table Editor, with the matching campus ID and campus email domain. Only those approved, confirmed addresses receive the `teacher` role; all other signups remain students. This is a one-time campus setup plus an email allowlist, not a profile update query for every user.
6. Add the deployed app URL to Supabase Auth's allowed redirect/site URLs, then restart the Vite server.

The schema creates a private `campus-resources` bucket. Row-level security ties resource reads and signed file downloads to the member's campus, and only assigned teachers can upload or manage resources. Campus-domain and faculty-allowlist tables are private to database administrators. Profile update permissions allow members to edit only their name.

## Resource organization

Every resource records its type, course code and title, academic year, semester, description, and file metadata. Students can search by title or course, filter by type and course, save items for the current session, and download private files through short-lived signed URLs.

## Checks

```sh
npm run build
npm run lint
```