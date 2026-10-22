-- GON P04 migration 0001: PostgreSQL extensions and Auth.js tables.
--
-- The Auth.js PostgreSQL adapter intentionally uses unqualified table names
-- and quoted camel-case columns. Keep those names byte-for-byte compatible
-- with @auth/pg-adapter 1.11.3. GON domain users live in gon_users (0002),
-- never in the Auth.js `users` table.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists vector;

create table users (
  id serial primary key,
  name varchar(255),
  email varchar(255),
  "emailVerified" timestamptz,
  image text
);

-- Google is the only approved production provider in Private Alpha. The
-- adapter looks users up by email, so two Auth.js users with one non-null
-- email would make identity resolution ambiguous.
create unique index users_email_unique_idx
  on users (email)
  where email is not null;

create table accounts (
  id serial primary key,
  "userId" integer not null references users(id) on delete cascade,
  type varchar(255) not null,
  provider varchar(255) not null,
  "providerAccountId" varchar(255) not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  constraint accounts_provider_account_unique
    unique (provider, "providerAccountId")
);

create index accounts_user_id_idx on accounts ("userId");

create table sessions (
  id serial primary key,
  expires timestamptz not null,
  "sessionToken" varchar(255) not null unique,
  "userId" integer not null references users(id) on delete cascade
);

create index sessions_user_id_idx on sessions ("userId");
create index sessions_expires_idx on sessions (expires);

create table verification_token (
  identifier text not null,
  expires timestamptz not null,
  token text not null,
  primary key (identifier, token)
);

comment on table users is 'Auth.js identity-provider users; not GON domain users.';
comment on table accounts is 'Auth.js provider accounts. Provider subject is the stable external identity key.';
comment on table sessions is 'Auth.js revocable database sessions.';
