# SignSyncer

A Vercel-compatible SaaS web application for secure signature operations, account management, notifications, and support tickets.

## Stack

- Native browser JavaScript modules
- Supabase Auth and Postgres
- Vercel static deployment with SPA fallback

## Required environment variables

| Variable | Public/secret | Purpose | Configure in Vercel |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Supabase project URL used by the browser client. | Project Settings → Environment Variables |
| `VITE_SUPABASE_ANON_KEY` | Public | Supabase anonymous key. Access is restricted by RLS policies below. | Project Settings → Environment Variables |

Do not expose Supabase service-role keys in this application.

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

## Development

```bash
npm run dev
npm run build
```
