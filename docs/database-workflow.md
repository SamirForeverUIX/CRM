# Database Workflow (Prisma-First)

This project keeps the schema source of truth in `prisma/schema.prisma`.

## Why this exists
- Every schema change is visible in one place.
- Every change can become a named migration.
- Team members know exactly what to run after pulling changes.

## One-time setup
1. Install dependencies:
   - `npm install`
2. Ensure `.env` has `DATABASE_URL`.
3. Generate Prisma client:
   - `npm run prisma:generate`

## Day-to-day schema change flow
1. Edit `prisma/schema.prisma`.
2. Create migration:
   - `npm run prisma:migrate:dev -- --name your_change_name`
3. Regenerate client (usually automatic, but run if needed):
   - `npm run prisma:generate`
4. Commit both:
   - `prisma/schema.prisma`
   - `prisma/migrations/*`

## Pulling new changes
1. `npm install`
2. `npm run db:prepare`

## Legacy compatibility note
The app still uses repository SQL queries at runtime. Prisma owns schema evolution and migration tracking.
`db/schema.js` is retained as a fallback/legacy path only and should not be used for new schema work.
