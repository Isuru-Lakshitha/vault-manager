# Changelog

All notable changes to VaultManager are documented in this file.

## [2.2.0] - 2026-11-15

### Added
- **Integer-Cents Money Core (`frontend/src/utils/money.js`)**: Exact integer-cents arithmetic (`toCents`, `fromCents`, `roundMoney`, `addMoney`, `subMoney`, `mulMoney`, `isValidMoney`) eliminating IEEE-754 floating-point drift across the entire ledger.
- **Ledger Audit & Drift Verification (`auditLedger`)**: Per-account ledger drift detection comparing stored balances (`opening_balance + sum(movements)`) against active ledger records in integer cents.
- **Server-Side Firestore Balance Integrity Rules (`firestore.rules`)**: Every update to `accounts/{accountId}` that modifies `balance` must reference an atomic `transactions/{last_ledger_ref}` operation (`create | update | delete | reverse | reconcile`) whose signed movement matches the balance delta.
- **TOTP Two-Factor Authentication (`TotpMfaPanel.jsx`, `Login.jsx`)**: Native Firebase Auth TOTP 2FA enrollment, verification, and sign-in challenge support for Google Authenticator, Authy, 1Password, and Apple Passwords.
- **Configurable Inactivity Session Timeout (`sessionTimeout.js`, `Settings.jsx`, `App.jsx`)**: User-selectable inactivity auto-lock/sign-out intervals (15m, 30m, 60m, or disabled).
- **Client Telemetry & Error Logger (`errorLogger.js`, `ErrorBoundary.jsx`, `main.jsx`)**: Privacy-safe, rate-limited, append-only error logging to `users/{uid}/error_logs` for uncaught errors, unhandled rejections, and React error boundaries.
- **Privacy Policy & GDPR Data Rights (`Privacy.jsx`, `accountService.js`, `AccountDataRightsPanel.jsx`)**: Public `/privacy` policy route, 1-click full multi-collection JSON data export, and self-service permanent account and data deletion with re-authentication.
- **Release & CI Automation (`.github/workflows/ci.yml`, `scripts/deploy.sh`, `firebase.json`)**: Pre-deploy verification gates (`npm test && npm run lint && npm run build`), preview channel deploy script, and GitHub Actions CI workflow.

### Changed
- **Bundle Lazy-Loading (`TransactionPopup.jsx`, `InvoiceModal.jsx`, `TaxCapitalGainsModal.jsx`, `vite.config.js`)**: Converted static `pdfReport` imports to on-demand dynamic imports and excluded heavy export/chart chunks from initial `modulePreload`.
