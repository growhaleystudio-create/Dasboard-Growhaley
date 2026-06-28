# Database Migrations

PostgreSQL schema migrations for the Leads Generation Dashboard backend, managed
by [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate).

## Layout

- One JS migration file per change, named with the
  `<timestamp>_<slug>.cjs` pattern that `node-pg-migrate` expects.
- The `.cjs` extension is required because `backend/package.json` sets
  `"type": "module"`.
- Each file exports `up(pgm)` and `down(pgm)` functions.

## Configuration

Migrations read the connection URL from the `DATABASE_URL` variable. Copy the
template and fill it in:

```
cp .env.example .env
```

Set at minimum:

```
DATABASE_URL=postgres://user:password@localhost:5432/leads_generator
```

## Running migrations

From `backend/`:

```
npm run migrate up        # apply all pending migrations
npm run migrate down      # roll back the most recent migration
npm run migrate redo      # roll back then re-apply the most recent migration
npm run migrate:create my-change   # scaffold a new migration file
```

`node-pg-migrate` tracks applied migrations in the `pgmigrations` table, so
`up` is idempotent across runs.

## Conventions

- All tenant-scoped tables include `team_id uuid NOT NULL REFERENCES team(id)`
  (design rule R2.8).
- Use raw `pgm.sql()` for CHECK constraints, partial unique indexes, and
  extensions like `citext`/`pgcrypto`/`pg_trgm`.
- Annotate each constraint with the requirement ID it implements, e.g.
  `-- R8.1` next to the `lead.status` CHECK.
