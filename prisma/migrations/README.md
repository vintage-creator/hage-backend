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

## Adoption is automatic on first deploy

An existing database already has all the tables but no migration history, so the
first `migrate deploy` fails with **`P3005` (schema not empty)**. `scripts/startup.sh`
handles this **automatically, once**, using the credentials App Runner injects (so it
always targets the same database the app uses):

1. `prisma migrate deploy` → hits `P3005`.
2. `prisma db push` (no `--accept-data-loss`, so it aborts rather than dropping data)
   repairs additive drift — including the columns prod is currently missing.
3. `prisma migrate resolve --applied 0_init` records the baseline.
4. `prisma migrate deploy` again → now a no-op.

So **just merging and deploying this branch fixes the current outage** — no manual DB
access needed. A brand-new / empty database needs nothing special either: `migrate
deploy` simply runs `0_init` and creates everything.

### Manual fallback (only if the auto-adoption logs a warning)

If startup logs show `db push` failed (e.g. destructive drift it refused to apply),
baseline the database the **production service connects to** (`hage-mvp/prod/rds/master`
secret) by hand, with `DATABASE_URL`/`DIRECT_URL` pointing at it:

```bash
npx prisma db push                            # inspect/repair; NO --accept-data-loss
npx prisma migrate resolve --applied 0_init   # record baseline
```

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
