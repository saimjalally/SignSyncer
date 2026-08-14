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

## Supabase schema and RLS

Run this SQL in Supabase before launch:

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user','support_agent','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 160),
  description text not null check (char_length(description) between 10 and 5000),
  category text not null,
  priority text not null,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;
alter table notifications enable row level security;

create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile except role" on profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from profiles where id = auth.uid()));
create policy "Users insert own profile" on profiles for insert with check (auth.uid() = id and role = 'user');

create policy "Users read own tickets" on support_tickets for select using (auth.uid() = user_id or exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('support_agent','admin')));
create policy "Users create own tickets" on support_tickets for insert with check (auth.uid() = user_id);
create policy "Support updates tickets" on support_tickets for update using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('support_agent','admin')));

create policy "Ticket participants read messages" on ticket_messages for select using (exists(select 1 from support_tickets t where t.id=ticket_id and (t.user_id=auth.uid() or exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('support_agent','admin')))));
create policy "Ticket participants insert messages" on ticket_messages for insert with check (auth.uid() = sender_id and exists(select 1 from support_tickets t where t.id=ticket_id and (t.user_id=auth.uid() or exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('support_agent','admin')))));

create policy "Users read own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications" on notifications for update using (auth.uid() = user_id);
```

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
