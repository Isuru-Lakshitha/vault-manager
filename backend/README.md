# Money Manager local API

The web frontend uses Firebase directly. This optional SQLite API now requires a Firebase ID token on every route (`Authorization: Bearer <ID token>`). Tokens are verified by Firebase Admin, including revocation checks. It binds to localhost by default.

## Setup

Use server-side Google application-default credentials for the same Firebase project. Set `GOOGLE_APPLICATION_CREDENTIALS` to the service-account JSON path, or use the deployment environment's application-default identity. Never put Admin credentials in the frontend or commit them.

Optional variables:

- `FIREBASE_PROJECT_ID`: defaults to the existing `money-manager-isuru` project.
- `MONEY_MANAGER_DATA_DIR`: directory for isolated databases; defaults to `backend/user-data`.
- `ALLOWED_ORIGINS`: comma-separated frontend origins; defaults to the local Vite origins.
- `PORT`: defaults to 3001.

Run `npm start` from this directory. Without valid server credentials, authentication fails closed.

Each verified UID maps to its own hashed database filename. The old `money_manager.sqlite` has no owner information and is never automatically exposed or assigned. Keep a separate backup. Its rightful owner can import it through the authenticated `/restore/system` endpoint after reviewing the contents. Restore replaces only that user's records, atomically. Uploaded schema, triggers, and views are never executed. Uploads are limited to 10 MB.

System backups use SQLite's consistent backup API and contain only the signed-in user's database. Excel exports are likewise scoped. Restore accepts only this app's five core tables and validates financial values and transaction references; invalid imports roll back.

## Verification

`npm test` checks authentication, database isolation, transfers/fees, decimal accuracy, edit/delete reversals, missing accounts, foreign keys, and transactional rollback.

Loan payment records cannot be edited or deleted through the generic transaction endpoint: reversing only their account debit would corrupt the loan principal. Payments require a valid source account and cannot exceed the outstanding balance.

## Legacy cloud import utility

`migrate.js` is dry-run-only by default and reads the legacy file without modifying it. Set `MIGRATION_OWNER_UID` to its known owner. Only `APPLY_MIGRATION=1` enables cloud writes, using Admin credentials and an existing verified user. Records are created with owner-prefixed IDs and remapped references; existing records are never overwritten. The import uses multiple batches, so a later error can leave earlier batches imported. Review existing IDs before retrying. Admin imports bypass client rules: reconcile legacy data and balances before use.
