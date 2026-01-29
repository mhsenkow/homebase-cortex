# Local Database Setup Guide

> **AI Note**: Docker-based local database setup. See [README.md](./README.md) for full getting started guide.

This project uses **Docker** for local PostgreSQL development. This gives you an isolated, reproducible database without installing PostgreSQL directly on your machine.

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### 0. Set Up Environment Files (First Time Only)

```bash
# Create local env file from template
cp env.example .env.local.template

# Edit with your local Docker settings (defaults should work):
# DATABASE_URL="postgresql://postgres:postgres@localhost:5434/homebase_cortex"
# NEXT_PUBLIC_DB_ENV="local"
```

### 1. Start the Database

```bash
npm run db:up
```

This starts a PostgreSQL 15 container on port **5434** (to avoid conflicts with fusion-cortex on 5433).

### 2. Push the Schema

```bash
npx prisma db push
```

### 3. Seed Sample Data (Optional)

```bash
npm run db:seed
```

Creates 5 demo retail sites with ~850 devices, zones, rules, faults, and BACnet mappings.

### 4. Start Development

```bash
npm run dev:local
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Switching

The project supports two database environments:

| Command | Database | Use Case |
|---------|----------|----------|
| `npm run dev:local` | Local Docker PostgreSQL | Development, testing |
| `npm run dev:cloud` | Supabase (cloud) | Presentations, demos |

The Settings → Data section shows which environment is currently active.

---

## Docker Commands

| Command | Description |
|---------|-------------|
| `npm run cortex:wakeup` | 🧠 Start entire stack (app + database) |
| `npm run cortex:sleep` | 🧠 Stop entire stack |
| `npm run db:up` | Start PostgreSQL container only |
| `npm run db:down` | Stop PostgreSQL container |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `docker compose down -v` | Stop container AND delete all data |

---

## Database Details

| Property | Value |
|----------|-------|
| Host | `localhost` |
| Port | `5434` |
| Database | `homebase_cortex` |
| User | `postgres` |
| Password | `postgres` |

Connection string:
```
postgresql://postgres:postgres@localhost:5434/homebase_cortex
```

---

## Troubleshooting

### "Port 5432 is already in use"
The Docker container uses port **5434** to avoid conflicts with fusion-cortex (which uses 5433). If you see this error, another PostgreSQL instance may be running.

### "Cannot connect to Docker daemon"
Make sure Docker Desktop is running. Open Docker Desktop and wait for it to fully start.

### "Database does not exist"
Run `npx prisma db push` to create the schema.

### Reset Everything
To completely reset your local database:
```bash
docker compose down -v    # Removes container AND data volume
npm run db:up             # Fresh container
npx prisma db push        # Create schema
npm run db:seed           # Optional: add sample data
```

---

## Cloud Database (Supabase)

For production or presentations, use Supabase:

1. Create a project at [supabase.com](https://supabase.com)
2. Get your connection string from Project Settings → Database
3. Update `.env.cloud` with your connection string
4. Run `npm run dev:cloud` to use the cloud database
