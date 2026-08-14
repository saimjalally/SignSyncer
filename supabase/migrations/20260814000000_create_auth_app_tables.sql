create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user','support_agent','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 160),
  description text not null check (char_length(description) between 10 and 5000),
  category text not null,
  priority text not null,
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved','Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id and role = 'user');
drop policy if exists "Users update own profile except role" on public.profiles;
create policy "Users update own profile except role" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

drop policy if exists "Users read own tickets" on public.support_tickets;
create policy "Users read own tickets" on public.support_tickets for select using (auth.uid() = user_id or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support_agent','admin')));
drop policy if exists "Users create own tickets" on public.support_tickets;
create policy "Users create own tickets" on public.support_tickets for insert with check (auth.uid() = user_id);
drop policy if exists "Support updates tickets" on public.support_tickets;
create policy "Support updates tickets" on public.support_tickets for update using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support_agent','admin')));

drop policy if exists "Ticket participants read messages" on public.ticket_messages;
create policy "Ticket participants read messages" on public.ticket_messages for select using (exists(select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support_agent','admin')))) and (internal is false or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support_agent','admin'))));
drop policy if exists "Ticket participants insert messages" on public.ticket_messages;
create policy "Ticket participants insert messages" on public.ticket_messages for insert with check (auth.uid() = sender_id and exists(select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('support_agent','admin')))));

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
