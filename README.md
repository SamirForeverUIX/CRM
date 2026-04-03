# Backpack CRM

Learning centre CRM built with Express + EJS + PostgreSQL.

## Quick Start

1. Install dependencies:
	 - `npm install`
2. Add `.env` with `DATABASE_URL`.
3. Run DB setup:
	 - `npm run setup-db`
4. Start app (auto applies Prisma migrations):
	 - `npm run dev`

## Database Commands

- Prepare DB from Prisma schema + migrations:
	- `npm run db:prepare`
- Seed data:
	- `npm run seed`
- Legacy SQL compatibility migration script (fallback only):
	- `npm run migrate`

## Prisma Modeling Workflow

Prisma schema is tracked in `prisma/schema.prisma` and is the source of truth.

- Generate client:
	- `npm run prisma:generate`
- Introspect DB:
	- `npm run prisma:introspect`
- Create migration in development:
	- `npm run prisma:migrate:dev -- --name your_change_name`
- Apply migrations in deploy/prod:
	- `npm run prisma:migrate:deploy`
- Open Prisma Studio:
	- `npm run prisma:studio`

Detailed process: see `docs/database-workflow.md`.
