# Database operations

Wordrill uses PostgreSQL as the source of truth for chat rooms, memberships, messages, mentions, and read positions. Socket.IO only delivers realtime events; clients recover message history from PostgreSQL after reconnecting.

## Connection pooling

Set a bounded Prisma pool in the production `DATABASE_URL`. The appropriate size depends on the database connection limit and the number of application instances.

```text
postgresql://USER:PASSWORD@HOST:5432/wordrill?connection_limit=10&pool_timeout=10
```

When an external transaction pooler such as PgBouncer is used, follow the pooler's Prisma compatibility settings. Run schema migrations through a direct database connection rather than the transaction pool.

## Backup and restore

Take automated PostgreSQL backups independently of the application process. Keep at least one copy outside the database host and periodically perform a restore drill.

For the local Docker Compose database, a logical backup can be created with `pg_dump`:

```powershell
docker compose exec -T postgres pg_dump -U wordrill -d wordrill -Fc > wordrill.dump
```

Restore into an empty verification database before relying on a backup. A restore overwrites data and must not be run against production without an approved recovery procedure.

## Message retention

The pruning command is a dry run unless `--execute` is explicitly supplied.

```bash
npm run db:prune-messages -- --days 365
npm run db:prune-messages -- --days 365 --execute
```

Always verify a recent backup and the dry-run count before deletion. Schedule the command outside peak traffic and record the result in operational logs.

## Growth monitoring

Monitor database size, message row count, index size, query latency, active connections, and backup duration. Review time-based message partitioning or archival when retention deletes and indexed history queries can no longer stay within the service latency target. Partitioning is intentionally deferred until those measurements justify the additional migration and foreign-key complexity.
