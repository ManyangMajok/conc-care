# Hostinger launch guide — conccaregroup.com.au

Repository: **https://github.com/ManyangMajok/conc-care**
Production branch: **main**
Application: **Express + React + MySQL**

You perform the Hostinger steps below. Deleting the existing website will leave the domain offline until the new application is deployed. It does not require deleting the domain registration or cancelling hosting.

## 1. Save a recovery copy

In the current WordPress website's dashboard, download a complete file backup and database backup to your computer. Check that both files downloaded successfully. Save any email you need. Record existing mail DNS records (MX, SPF, DKIM and DMARC) so the website change does not disrupt email. The new CRM will start empty and does not import WordPress customers, users or content automatically.

## 2. Delete the WordPress website

In hPanel, open **Websites**, locate **conccaregroup.com.au**, choose **⋮ → Delete**, and verify the domain in the confirmation dialog. Deletion permanently removes the site's files and associated databases. **Leave “Delete email service” unchecked** if you use email on this domain. Confirm the website deletion, then wait for it to disappear from the list; Hostinger says this can take up to ten minutes. Do not delete the domain registration or the hosting plan.

[Hostinger's deletion instructions](https://www.hostinger.com/support/3624731-how-to-delete-a-website-from-a-hosting-plan-in-hostinger/)

## 3. Create the Node.js application from GitHub

Go to **Websites → Add/Create website → Node.js Web App → Import Git repository**. Connect the GitHub account **ManyangMajok**, select **conc-care**, and choose branch **main**. Assign **conccaregroup.com.au** when prompted; if Hostinger first assigns a temporary domain, connect the final domain from the new app dashboard after deployment.

Use these settings:

| Setting | Value |
| --- | --- |
| Framework | Express / server-side Node.js |
| Node version | 24.x |
| Root directory | `.` (repository root) |
| Build command | `npm run build` |
| Start command, if shown | `npm run start:hostinger` |
| Entry file, if shown | `hostinger.js` |
| Port | `3000` unless supplied by Hostinger |

Keep the Express backend settings. Do not choose a static React/Vite-only deployment. The build creates `dist`, but the Node process also needs `hostinger.js`, `server/` and `migrations/` from the repository root. If an output-directory field appears, keep the Express default and ensure the selected backend package includes those files; do not publish only `dist` as a static site.

[Hostinger's GitHub deployment instructions](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)

## 4. Create a new MySQL database

Under the new site's **Dashboard → Databases → Management**, create a database such as `conccare` and a new user with a strong password. Hostinger may prefix the database and username: copy the **complete names**, not just the short suffix. Note the database host shown in hPanel, usually `localhost`, and port, normally `3306`.

If Databases is unavailable until the app is created, finish creating the app first. Its first startup may fail because the database is not configured; create the database, add the environment values below, then redeploy. Do not substitute old WordPress database credentials.

The schema is tested on MySQL 8.4.11. Confirm the supplied database version and permissions support table/index creation, CHECK constraints and triggers. A trigger-permission error must be resolved with Hostinger support; do not delete the immutable audit triggers to bypass it.

[Hostinger's database connection instructions](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## 5. Add environment variables in hPanel

At **Review build settings → Environment variables**, or the app's deployment settings, add the following. Values below marked YOUR_* are placeholders to replace in hPanel, not real credentials.

```dotenv
NODE_ENV=production
NPM_CONFIG_INCLUDE=dev
HOST=0.0.0.0
PORT=3000
APP_ORIGIN=https://conccaregroup.com.au
DB_HOST=localhost
DB_PORT=3306
DB_NAME=YOUR_FULL_DATABASE_NAME
DB_USER=YOUR_FULL_DATABASE_USERNAME
DB_PASSWORD=YOUR_DATABASE_PASSWORD
DB_POOL_SIZE=5
DB_SSL=false
BUSINESS_TIMEZONE=Australia/Perth
TRUST_PROXY=1
MAIL_MODE=disabled
SETUP_DATABASE=true
INITIAL_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
INITIAL_ADMIN_NAME=Administrator
INITIAL_ADMIN_PASSWORD=YOUR_NEW_STRONG_ADMIN_PASSWORD
```

Use the actual database host. DB_SSL=false is for Hostinger's local database connection; use verified TLS for an external database. TRUST_PROXY=1 assumes one trusted Hostinger proxy that replaces forwarded headers; confirm the topology/client-IP handling if the panel setup differs. NPM_CONFIG_INCLUDE=dev ensures Vite is installed during the build even in production mode.

The administrator password must be at least 12 characters; use a long, unique generated password. Keep credentials in hPanel only—never put them in GitHub or chat. Do not upload the development `.env` files.

If using a temporary domain initially, APP_ORIGIN must match its **exact HTTPS origin**, with no trailing slash. Change it to the final domain when that domain is connected. A mismatch causes form/login submissions to be rejected.

[Hostinger's environment-variable instructions](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)

## 6. Deploy and check the logs

Click **Deploy** or **Save and redeploy**. The build must succeed, then the backend must start. With SETUP_DATABASE=true, the app creates the schema and first administrator in the empty database. Existing accounts are never overwritten. No local database or administrator password is copied from the repository.

Look for “Initial administrator ready” and the server startup message. If setup fails, inspect runtime logs: fix database credentials, version or privileges before continuing. MySQL schema changes auto-commit, so a partially applied migration needs inspection; do not delete populated tables or repeatedly enable setup blindly.

Open `https://conccaregroup.com.au/health/ready` (or the temporary domain) and confirm it returns `{"status":"ready"}`.

## 7. Disable first-run setup

After setup succeeds, set **SETUP_DATABASE=false**, remove **INITIAL_ADMIN_EMAIL**, **INITIAL_ADMIN_NAME** and **INITIAL_ADMIN_PASSWORD**, and redeploy. Sign in at **https://conccaregroup.com.au/office** with the administrator account you just created.

Where hPanel permits separate users, use a schema-scoped migration account for setup and switch the running app to a user with only SELECT, INSERT, UPDATE and DELETE permissions. The app does not need a server-root account. Future schema migrations require a backup and a planned setup-enabled deployment before returning to normal runtime permissions.

## 8. Connect domain, HTTPS and www

If the app still uses a temporary domain, choose **Connect domain** and assign **conccaregroup.com.au**. Follow the DNS instructions shown by Hostinger; do not guess an IP address or remove mail DNS records. Hostinger provisions SSL after the domain connects. Change APP_ORIGIN to **https://conccaregroup.com.au** and redeploy.

Configure **www.conccaregroup.com.au → https://conccaregroup.com.au** as a permanent redirect in Hostinger so visitors use one canonical origin. Verify both HTTPS addresses and the office login. If the browser reports a certificate error, wait for/fix SSL provisioning rather than bypassing it.

[Hostinger's custom-domain/SSL instructions](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)

## 9. Run the live acceptance checks

- Public pages, photos, navigation and mobile layouts load correctly.
- A clearly labelled test enquiry saves in the CRM.
- Contact/site linking, quote issuance/revision, invoice creation and quote conversion work.
- An office account cannot open administrator controls; logout prevents further CRM access.
- `/health/ready` returns ready through HTTPS.
- Replace labelled sample projects/team/testimonials with approved business information before public promotion.

Invoice PDFs, invoice email, payment collection and automatic password recovery are not implemented. Recording an invoice as paid does not process a payment.

## 10. Enable enquiry email and backups

Website enquiries are saved while MAIL_MODE=disabled, but no messages are sent. To enable transactional enquiry mail, add SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM and OFFICE_EMAIL from your email provider, then set MAIL_MODE=smtp and redeploy. Test delivery with an approved mailbox and verify sender DNS. Disabled historical messages are not sent automatically.

Configure database/file backups and verify the retention available on your Hostinger plan. Keep encrypted off-host copies and test restoring the MySQL database, including its seven audit triggers. The repository includes `scripts/backup.js` and `scripts/verify-backup.js` for a trusted environment with MySQL client tools; use hPanel/provider backups if shell access is restricted. Add uptime monitoring for `/health/ready`.

## 11. Maintain the site through Git

Make changes locally, run the checks, commit and push to **main**. GitHub Actions runs the build, database tests and browser workflows. Review the result before redeploying in Hostinger. Decide in hPanel whether pushes deploy automatically; an automatic Hostinger deployment may begin before GitHub checks finish, so use manual redeploys until a tested release process is established.

Do not edit generated deployment files in Hostinger File Manager: the next Git deployment can overwrite them. Store configuration in hPanel environment variables, keep application changes in GitHub, and create a backup before database migrations. Git reverts roll back code, not database data.
