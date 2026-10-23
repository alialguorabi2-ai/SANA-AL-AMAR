# SANA AL-AMAR — Course administration (first working module)

This folder implements the initial desktop/mobile-responsive admin dashboard consistent with the approved navy-and-orange visual reference. The existing end-user design remains unchanged. Data comes directly from the connected Supabase project; do not replace counts or dates with screenshots' fictitious values.

## Preview

Open `admin/index.html?preview=1` in a browser. Preview uses an explicitly marked example course and **does not read or modify private data**. The live page requires a staff login.

## Live connection

Supabase project: `sseugkalnlclovwhxiys`. The **publishable (public) key** in `app.js` is expected to ship to clients; never add a secret or service-role key. All permissions are enforced by Supabase RLS.

The `database/course_admin_security.sql` migration was applied to the Supabase project. It preserves published-only public reads while allowing staff draft reads, inserts, updates, course publication, and request status updates.

The project currently has **no Supabase Auth users**. Before real login can work, create a trusted employee user via Supabase Auth using an administrative workflow and assign `app_metadata.sana_role` to `admin` or `editor` using admin privileges (never through user-editable metadata). Then sign in from the dashboard. A frontend signup cannot assign staff roles. After changing roles, refresh the user's session to receive updated JWT claims.

## Included in first module

- Login via Supabase Auth; unauthorized sessions are rejected.
- Real KPIs for courses, published courses, drafts, pending registration requests. No invented staff/trainee counts.
- Create and edit a course (Arabic/English title, slug, description, outline, certificate type, cover image HTTPS URL, featured flag).
- Create/edit its annual offering (year, duration, delivery mode, audience and seat capacity).
- Save drafts; publish/unpublish the course and the selected annual offering atomically via `sana_set_course_publication`.
- View registration requests and update their approval status.
- Public course reads remain restricted to published entries.
- Other navigation sections are labeled placeholders for future modules.

## Limitations / follow-up

- Account creation and role assignment remain administrative setup actions.
- This is an initial static web frontend; it is not yet hosted on a production domain or connected to a native Expo mobile client.
- No media uploads or course session-specific scheduling yet; cover uses an HTTPS image URL, and offering is recorded by training year.
- Authenticated staff functionality requires a real privileged account for end-to-end UI tests. RLS and syntax checks have been performed without creating a fake user.
- Staff role checks use signed app_metadata claims; JWTs can retain role until refreshed.
- Do not publish private course media, learner certificate files or sensitive names on public screens.
- Use a proper HTTPS origin for hosted production sessions. No secret credentials belong in this repository.
