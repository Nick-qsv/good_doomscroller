# Database

The PostgreSQL schema lives in `migrations/`. Migrations are plain SQL so the
Python pipeline and Next.js application share one source of truth.

Apply all migrations in filename order:

```sh
npm --prefix apps/web run migrate
```

The migrations are safe to run repeatedly. Application code should use
idempotent reaction writes:

```sql
INSERT INTO reactions (actor_id, passage_id, value)
VALUES ($1, $2, $3)
ON CONFLICT (actor_id, passage_id)
DO UPDATE SET value = EXCLUDED.value;
```

The application feed can query `feed_passages`. Only rows whose passage status
is `published` appear in that view.
