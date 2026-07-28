# Database migrations (adopted from `db push`)

This project historically synced its schema with `prisma db push` and had **no
migration history**. It now uses **`prisma migrate deploy`**, which runs on every
container boot (`scripts/startup.sh`) so schema changes always reach the
(populated) production database — the old flow only pushed when the DB was empty,
so changes silently never applied and prod drifted (e.g. `P2022: column
User.isAvailable does not exist`).

`0_init/migration.sql` is the **baseline** — the full current schema, generated with:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

## One-time baselining of EXISTING databases (required — do this before the first deploy)

An existing database already has all the tables, so `migrate deploy` would try to
run `0_init` (all `CREATE TABLE`s) and fail with **`P3005` (schema not empty)**.
Each existing database (production, and any shared dev DB) must be baselined once.

Run these **from a machine that can reach the database**, with `DATABASE_URL` and
`DIRECT_URL` in your environment pointing at **that** database:

```bash
# 1. Make the database match the current schema first (additive; aborts if it would
#    drop data). This also applies the columns prod is currently missing.
npx prisma db push        # NO --accept-data-loss

# 2. Record the baseline as already-applied so migrate deploy won't re-run it.
npx prisma migrate resolve --applied 0_init
```

After this, `prisma migrate deploy` (on every boot) is a no-op until a NEW migration
is added, and the current prod outage is resolved (step 1 adds the missing columns).

> ⚠️ Baseline the database the **production App Runner service actually connects to**
> (the value of the `hage-mvp/prod/rds/master` secret), not a local copy. If your
> local `.env` points at a different DB, baselining that one will not fix prod.

A brand-new / empty database needs **no** baselining — `migrate deploy` runs `0_init`
and creates everything automatically.

## Making schema changes from now on

Do **not** hand-edit the DB or use `db push` in shared environments anymore. Instead:

```bash
# edit prisma/schema.prisma, then:
npx prisma migrate dev --name <describe_change>   # creates prisma/migrations/<ts>_<name>/
git add prisma/migrations && git commit
```

The next deploy runs `prisma migrate deploy`, applying the new migration to every
environment automatically.

## DIRECT_URL

`prisma/schema.prisma` sets `directUrl = env("DIRECT_URL")` because production runs on
a Supabase connection pooler, which cannot run DDL. `deploy.yml` now provides
`DIRECT_URL` in every App Runner env block. It currently points at the **same** secret
value as `DATABASE_URL`, which is correct while `DATABASE_URL` is the **session-mode**
pooler (`...pooler.supabase.com:5432`). If `DATABASE_URL` is ever switched to the
**transaction-mode** pooler (`:6543`), point `DIRECT_URL` at the direct connection
(`db.<ref>.supabase.co:5432`) via a dedicated `DIRECT_URL` key in the secret instead.
