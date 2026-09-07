-- Run once in a dedicated Supabase project. No anonymous/authenticated database access.
create table if not exists public.workspace (
 id integer primary key check (id=1),
 version bigint not null default 0,
 data jsonb not null
);
alter table public.workspace enable row level security;
revoke all on public.workspace from anon, authenticated;
insert into public.workspace(id,data) values (1,'{"members":[],"clients":[],"tasks":[],"notifications":[],"events":[]}') on conflict do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('raw-footage','raw-footage',false,1073741824,array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict(id) do nothing;
-- After creating the owner's Auth user (without sending an invitation), insert their real UUID:
-- update public.workspace set data=jsonb_set(data,'{members}', '[{"id":"AUTH-USER-UUID","name":"YOUR-NAME","role":"approver"}]'), version=version+1 where id=1;
-- Add existing authenticated users via the app's Team settings. Do not enable public signup.
