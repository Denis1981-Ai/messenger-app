# Internal Messenger Runbook

## Current pilot scope
- Public limited pilot runs through `DEPLOY_PUBLIC.md`
- `PILOT_ROLLOUT.md` is the daily operator document for the live pilot
- `BUG_REPORT_TEMPLATE.md` is the only bug intake template for pilot users

## Current source of truth by scenario
- Public live pilot: `DEPLOY_PUBLIC.md`
- Daily pilot operations: `PILOT_ROLLOUT.md`
- User-reported issues: `BUG_REPORT_TEMPLATE.md`
- This README keeps local/private operational commands and shared maintenance notes

## Local/private Compose path
Use this path only for local/private operations, not as the primary instruction for the public pilot.

## Compose environment file
1. Copy `.env.compose.example` to `.env.compose`
2. Set at least:
- `SESSION_SECRET`
- `SESSION_COOKIE_SECURE`
- `POSTGRES_PASSWORD`
Optional:
- `POSTGRES_DB` - defaults to `messenger_stage1`
- `APP_PORT` - defaults to `3000`
- `HOST_POSTGRES_PORT` - defaults to `5432`
- `OPENAI_API_KEY` - optional for `/api/chat`

## Start
```powershell
cd C:\Users\denis\Desktop\Ai\messenger-app\frontend
Copy-Item .env.compose.example .env.compose
docker compose --env-file .env.compose up -d --build
```

## Safe first run for local/private environment
1. Apply schema only:
```powershell
docker compose --env-file .env.compose exec app npx prisma migrate deploy
```
2. Do not run seed for live pilot.
3. Create the first real active user with a strong password inside the app container:
```powershell
docker compose --env-file .env.compose exec app npm run user:create -- --login <login> --name "<Name>" --password "<strong-password>"
```
4. Create at least one more real user the same way if you want to exercise real chat flow.
5. Verify login for the created user in the browser at the pilot URL.

## Dev/test bootstrap only
Use demo seed only in disposable dev/test environments.
It wipes existing users, chats, messages, attachments and sessions.
Seed is blocked by default and requires explicit opt-in:
```powershell
docker compose --env-file .env.compose exec app sh -lc "ALLOW_DEV_SEED=true npm run prisma:seed"
```
Demo users created by seed are for local smoke only and must not be used for live pilot rollout.

## Stop
```powershell
docker compose --env-file .env.compose down
```

## Restart
```powershell
docker compose --env-file .env.compose down
docker compose --env-file .env.compose up -d --build
```
Then run the smoke check with a real active pilot user.

## Health / readiness
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health
```
- `200` means app is up and DB is reachable
- `503` means app is up but DB is not reachable

## Persistence
- PostgreSQL data is stored in the Docker volume created by the active compose project
- Uploaded files are stored on the host in `storage/uploads`
- `storage/uploads` survives app container restarts because it is bind-mounted into the container

## Backup
Create PostgreSQL backup:
```powershell
npm run ops:backup
```
Optional explicit output file:
```powershell
npm run ops:backup -- --output .\backups\messenger-manual.dump
```
- Works with local `pg_dump` or falls back to the PostgreSQL Docker container
- For the public pilot on VPS, use the server-side path from `DEPLOY_PUBLIC.md`

## Restore
Restore PostgreSQL backup:
```powershell
docker compose --env-file .env.compose down
npm run ops:restore -- --input .\backups\messenger-manual.dump
docker compose --env-file .env.compose up -d --build
```
Then run the smoke check again.

## Smoke check after start/restart
```powershell
npm run ops:smoke -- --url http://127.0.0.1:3000 --login <active-login> --password <password>
```
Checks:
- health endpoint
- login
- list chats
- text message
- file upload
- file download

Important:
- this smoke check requires at least one existing chat for that user
- on a brand new live pilot DB, first create the real users, then create the first chat through the normal app flow, then run smoke

## User operations for pilot runtime
List users:
```powershell
docker compose --env-file .env.compose exec app npm run user:list
```

Create user:
```powershell
docker compose --env-file .env.compose exec app npm run user:create -- --login <login> --name "<Name>" --password "<password>"
```

Reset password:
```powershell
docker compose --env-file .env.compose exec app npm run user:reset-password -- --login <login> --password "<new-password>"
```
- Existing sessions for that user are revoked

Disable user:
```powershell
docker compose --env-file .env.compose exec app npm run user:disable -- --login <login>
```
- Disabled user cannot log in
- Existing sessions for that user are revoked
