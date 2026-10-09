# Conc Care

Public website and office CRM for **conccaregroup.com.au**. React/Vite frontend, Express backend and MySQL 8.4. Source repository: https://github.com/ManyangMajok/conc-care.

## Deploy to Hostinger

Follow [the complete launch guide](docs/hostinger.md). Connect Hostinger's Node.js app to this repository's `main` branch, select Express and Node 24, build with `npm run build`, and start `hostinger.js` (`npm run start:hostinger`). Configure secrets in hPanel using [the environment template](deploy/hostinger.env.example). Do not publish local `.env` files.

## Development

Requires Node 22.16+ and a separate MySQL 8.4 database. Copy `.env.example` to `.env` and configure a runtime user with SELECT/INSERT/UPDATE/DELETE permissions. Configure `.env.migrate` with schema-migration credentials. On a fresh database, run migrations and create an administrator:

```sh
npm ci
npm run db:migrate
npm run user:create -- admin@example.com "Administrator" admin
npm run dev
```

Supply the new administrator password through `CCG_NEW_PASSWORD` or stdin. The script never embeds a default password. Local URL: http://localhost:3100; office URL: http://localhost:3100/office.

## Source layout

- `src/`: website and CRM React components.
- `src/site/`: maintained public page content, styles and service definitions. These files are application source, not build output.
- `public/assets/`: website images and logos.
- `server/`: authenticated APIs, validation, transactions, sessions and mail worker.
- `migrations/mysql/`: checksummed schema migrations; never edit an already-applied migration.
- `scripts/`: database migration, user creation, backup/restore and browser-test startup.
- `tests/`: database, security, concurrency and browser tests.
- `deploy/` and `docs/`: Hostinger environment template and launch instructions.

There is no PHP or SQLite runtime. Database files, credentials, dependencies, build output and test reports are excluded from Git. Local recovery material is stored outside this repository.

## CRM behavior

Administrator and office accounts can manage contacts, sites, leads/pipeline, follow-ups, quotes/revisions, invoices, consent/segments and activity. Administrator-only controls manage accounts and show mail delivery status. Website enquiries save directly to the CRM. Public submissions never grant marketing consent or overwrite trusted contact information.

Quotes retain immutable issued snapshots. Invoices can be created manually or converted from a saved quote; conversion is idempotent per quote. Issued invoice details are locked; staff can record paid or void status. Amounts are integer AUD cents. GST, invoice PDFs, invoice email, payment collection and partial payments are not implemented.

MySQL transactions preserve relationships and reject stale updates. Writes are serialized across instances by a database lock row, suitable for a small office. Sessions expire after eight hours. Production uses secure cookies, origin/CSRF checks and a content security policy. Password recovery is currently administrator-operated; no automated recovery or MFA is implemented.

## Email

`MAIL_MODE=disabled` records notification status without sending. Enable SMTP only after configuring sender credentials and testing delivery. STARTTLS is required unless implicit TLS is selected. Historical disabled mail is not sent automatically; failed/uncertain sends need provider-log review before retry.

## Verification and backups

```sh
npm run build
npm test
npm run test:e2e
npm run db:backup -- /secure/backups/conc-care-YYYY-MM-DD.sql
```

Tests need `.env.test` with `DB_HOST`, `DB_PORT`, `TEST_DB_USER` and `TEST_DB_PASSWORD` for an isolated test server. They create disposable `ccg_test_*` schemas. Never point these credentials at production. Browser tests use Edge locally and Chromium in CI. The GitHub workflow runs the build, backend tests and browser workflows on every main-branch push and pull request.

Backups require `mysqldump` (or `MYSQLDUMP_BIN`). Verify a dump with `node --env-file=.env.restore scripts/verify-backup.js /secure/backups/file.sql`; this needs a restore account able to create/drop its temporary schema and a quiet source database for comparison. Schedule encrypted off-host backups and periodically test restoration.

Sample projects/team/testimonials are labelled. Replace them with approved business content before public launch. Hosting configuration, DNS/TLS and mail delivery must be verified in hPanel; a local build or passing CI alone does not confirm a live deployment.
