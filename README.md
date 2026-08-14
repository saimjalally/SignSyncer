# SignSyncer

A Vercel-compatible SaaS web application for secure signature operations, account management, notifications, and support tickets.

## Stack

- Native browser JavaScript modules
- Supabase Auth and Postgres
- Vercel static deployment with SPA fallback

## Required environment variables

This is a simple static JavaScript app, not a Vite project. Vercel still provides environment variables to `npm run build`, and `scripts/build.mjs` injects only the public Supabase browser configuration into `dist/src/supabase-config.js`. The browser never needs manual `localStorage` setup.

| Variable | Public/secret | Purpose | Configure in Vercel |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Supabase project URL used by the browser client, for example `https://your-project-ref.supabase.co`. | Project Settings → Environment Variables |
| `VITE_SUPABASE_ANON_KEY` | Public | Supabase anonymous/publishable key. Access is restricted by RLS policies below. | Project Settings → Environment Variables |

Do not expose Supabase service-role keys in this application. Never add real Supabase credentials to GitHub.

## Supabase setup

### 1. Apply the database migration

Run the migration in `supabase/migrations/20260814000000_create_auth_app_tables.sql` before testing authenticated database flows. You can apply it with the Supabase CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or paste the migration SQL into Supabase Dashboard → SQL Editor and run it once. The migration creates:

- `profiles` for user profile and role data.
- `support_tickets` for customer support requests.
- `ticket_messages` for ticket replies.
- `notifications` for per-user notifications.
- Row Level Security policies that let users access only their own records while allowing `support_agent` and `admin` profiles to read/update support workflows.

Signup itself uses Supabase Auth and does not require these tables to exist, but profile, support ticket, ticket message, and notification screens do require this migration.

### 2. Configure Supabase Auth URLs

In Supabase Dashboard → Authentication → URL Configuration:

1. Set **Site URL** to your production Vercel origin, for example `https://your-app.vercel.app`.
2. Add these **Redirect URLs** exactly, replacing the domain with your production domain:
   - `https://your-app.vercel.app/verify-email`
   - `https://your-app.vercel.app/reset-password`
3. If you use preview or custom domains, add those origins too, for example:
   - `https://your-custom-domain.com/verify-email`
   - `https://your-custom-domain.com/reset-password`
   - `http://localhost:4173/verify-email`
   - `http://localhost:4173/reset-password`

The app sends signup verification links to `/verify-email` and password reset links to `/reset-password` on the current origin. If these URLs are not allow-listed in Supabase, email verification and password recovery will not complete correctly on production.

### 3. Use only public browser credentials

Use the Supabase project URL and anon/publishable key only. Do not add a service-role key to Vercel or this repository. The anon key is safe for browsers when RLS policies are enabled.

## Deployment

1. In Supabase, copy the project URL and the public anon/publishable key. Do not use the service-role key.
2. In Vercel, open Project Settings → Environment Variables.
3. Add `VITE_SUPABASE_URL` with the Supabase project URL for each environment you deploy, such as Production, Preview, and Development.
4. Add `VITE_SUPABASE_ANON_KEY` with the Supabase public anon/publishable key for the same environments.
5. Redeploy the project so Vercel runs `npm run build` with those variables available.
6. Vercel should serve the generated `dist` directory. The `vercel.json` file sets `outputDirectory` to `dist` and keeps the single-page app fallback so direct links such as `/dashboard` and `/support/new` resolve to `index.html`.

If either public Supabase value is missing at build time, the deployed app intentionally shows the setup warning and disables backend actions. When both values are present, the warning is hidden and the browser client connects to Supabase.

## Development

For local builds, copy `.env.example` to `.env` and fill in your own Supabase public URL and anon/publishable key. `.env` is gitignored so real credentials are not committed.

```bash
cp .env.example .env
npm run build
npm run preview
```

You can also run the unbuilt source with `npm run dev`; it uses the checked-in empty `src/supabase-config.js` placeholder unless you provide a local config file yourself.
