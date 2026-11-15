# Money Manager improvements — 21 October 2026

## Implemented

- Professional shared slate/blue theme, labeled desktop navigation, neutral theme tokens across page/modal styles, matching light mode and login, and removal of competing legacy neon overrides.
- Unused code cleanup and corrected React dependencies. Lint now fails on warnings.
- SQLite API authentication with Firebase Admin token verification, revocation checks, localhost binding, origin allowlist, and a separate database per verified UID.
- Scoped backup/restore with upload limits, validated data-only imports, foreign keys and rollback; the original unowned database remains untouched.
- Financial input and account-reference validation. Shared tested balance calculations round to cents.
- Transfer fees linked to their parent and maintained atomically on edits/deletions. Unique legacy fees are reconciled; ambiguous matches fail without modifying data.
- Confirmed transaction writes replace optimistic financial mutations, preventing failed requests from leaving invented balances in the UI cache.
- Credit-card payments update card balance, source account and transaction atomically. Loan payments reject invalid dates and overpayment.
- Generic transaction editing/deletion blocks generated fee entries and linked loan/goal entries, avoiding partial reversals of those workflows.
- Firestore rules validate core financial records and related-account ownership. Nested bills/investments receive the same validation instead of an unrestricted recursive write rule.

## Local checks

Latest result: 23 tests passed (13 frontend, 10 backend), zero lint warnings/errors including undefined-symbol checks, and a successful production/PWA build.

From `frontend`: `npm test`, `npm run lint`, `npm run build`.
From `backend`: `npm test`.

The frontend API tests use an in-memory Firestore adapter to verify actual application orchestration, read-before-write ordering and failed commits. These do not replace server rule tests.

## Firestore rule integration gate

The Firebase CLI and a working Java runtime are required. From the project root, run:

```sh
firebase emulators:exec --only firestore --project demo-money-manager 'cd frontend && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:rules'
```

The suite is restricted to the local emulator and demo project. It checks unauthenticated and cross-user access, invalid amounts/types, ownership changes, nested collection validation and linked fee batches. No production data is used.

An earlier environment denied local ports. In the latest pass the app started and the login screen rendered; authenticated browser workflows remain unverified. The emulator download failed in this environment, so rules tests remain unexecuted. The rules are source changes, not a production deployment. After the emulator gate and an authenticated browser smoke test pass, deploy the reviewed rules separately.

## Browser acceptance checklist

Check desktop and phone widths, light/dark mode, search, navigation, keyboard focus, currency-expression input, and login readability. In a test account, create/edit/delete a transfer with fees and confirm both balances and reports reconcile. Verify a failed write leaves data unchanged. Check goal contributions with/without an account, loan payments and credit-card payments.

## Existing data and operational notes

The optional SQLite backend needs Firebase Admin credentials; see `backend/README.md`. Existing SQLite data is not automatically moved. No production database records, credentials, hosting or rules were modified.

Firestore rules provide ownership, type/range and reference checks; they do not make a client-maintained ledger tamper-proof. A future authoritative accounting backend would be needed to enforce every balance delta against its ledger entry. Older malformed records may need correction before they can pass the stricter update rules. Do not silently guess matches among duplicate legacy fees.

## Follow-up review — 22 October 2026

Latest verification: 20 frontend tests and 10 backend tests passed. Frontend lint has zero application warnings/errors and the production/PWA build succeeds. npm emits an environment-level `http-proxy` configuration warning; this is separate from application lint.

### Newly fixed

- Bill payments now debit accounts, create the payment record, and advance the bill in a single Firestore transaction. Stale payment dialogs are rejected after the cycle changes.
- Monthly/yearly dates clamp to the last valid day and retain the billing-day anchor (January 31 → February 28 → March 31).
- Receipt attachment no longer invents an amount or tax status from a filename. It explicitly requires manual entry. Invalid image reads release the loading state.
- Bulk rule edits only accept descriptive fields and cannot silently change transaction amounts/account references. Oversized batches fail before writing.
- Saved categorization rules load before transaction creation rather than depending on whether the rules dialog was previously opened.
- Offline rule/invoice/shared-tab storage keys include the signed-in UID. First-time saves initialize the cache instead of storing an empty list.
- Future-dated loans no longer accrue interest backward from an absolute date difference.
- CurrencyInput keeps its internal focus/blur/Enter handlers when a caller supplies handlers.

## Implementation update — 22 October 2026

This update supersedes the unresolved-items list from the earlier review.

### Implemented

- Backup exports include separate receipt images. Import planning validates references before writing and remaps accounts, goals, cards, loans, bills, recurring rules, receipts, transfer fees and reversal audit targets. Transfer and fee records import together. IDs are deterministic for the exact same backup, allowing interrupted imports to resume without overwriting completed records. Imports are additive; a different export is a separate copy, not a database rollback.
- Recurring payments debit accounts, update linked loans, write fee records and update monthly history in a single transaction. Stable cycle IDs protect retries. Reversing a payment allows a corrected payment in that cycle.
- New bill, loan, goal, card and recurring payments capture audit snapshots. Transaction details provide a reasoned reversal that retains the original record. Reversal refuses conflicting later changes to linked records. Older payments lacking snapshots require manual reconciliation.
- Account archiving preserves history and portfolio balances while blocking new payments. Quick Add excludes archived accounts. Accounts with history cannot change currency through the app.
- Transfers between different currencies require the actual destination amount; editing and deleting reconciles both native amounts. Cashback updates no longer overwrite a freshly saved balance.
- Frankfurter reference rates include source/date metadata. The invented rate fallback is removed, the dashboard rate direction is corrected, and unavailable conversion values are labeled. Analytics converts transactions and splits into the selected reporting currency and labels current-rate historical estimates.
- Quick Add saves UID-scoped offline drafts without changing balances. The sync panel supports review, discard, explicit sync and retained failure reasons. Draft submission IDs make retries idempotent. Other financial workflows still require a connection.
- Receipt OCR uses Tesseract locally, with recognized text and explicit field review before saving. Ambiguous totals/dates remain blank. Images are stored separately and exact image uploads are deduplicated per user. Receipt caches cannot return another user's images. OCR engine/language downloads need internet on first use.
- The professional theme remains in place; sync/draft panels are constrained for small screens. Login text accurately describes cloud sync and offline viewing.
- Updated affected dependencies, including maintained SheetJS 0.20.3 from its official distribution and a compatible gRPC override. Both package locks are retained for reproducible installs.

### Verification and release limits

- Latest automated suite: 39 frontend tests and 10 backend tests pass. Frontend lint and the production/PWA build pass. Dependency audits report zero known vulnerabilities for both packages. The API tests use a transactional Firestore adapter; they do not replace Firebase emulator or live-service validation.
- The OCR engine recognized the official English sample image (352 characters, 92% reported confidence). Receipt parser tests cover total selection and ambiguity. Browser OCR and mobile upload workflows still need testing.
- A live Frankfurter request parsed 165 quote currencies with a 21 October 2026 reference date and an available USD/LKR rate.
- The app started in a local browser and the login screen rendered. Signed-in workflows need a disposable test account. No production data, hosting or Firestore rules were deployed or changed.
- Firestore rules source now supports authenticated reads of absent documents needed by idempotent operations, while existing documents retain ownership checks. The CLI started the local demo emulator workflow, but downloading cloud-firestore-emulator-v1.22.0.jar from storage.googleapis.com failed. Run the emulator gate before deploying these rules; old deployed rules can block new imports/drafts/receipt deduplication.
- Bank connectivity remains statement import and a labeled sandbox. The assistant remains a local rule/scenario engine. Live bank and external AI integrations need a selected provider and credentials.
- OCR currently recognizes English. Non-English receipts and ambiguous layouts need manual review. Exact-image and likely duplicate checks do not guarantee detection of every duplicate photograph.
- Offline drafts are device-local, not cloud backups. Separate storage keys preserve drafts added by other tabs, and confirmed financial writes use Firestore transactions. Discarding a draft cannot cancel a submission already in flight in another tab.
- Mixed-currency analytics are reference-rate estimates, not historical booked exchange-rate accounting. Legacy loans/goals without currency fields and secondary forecast/budget widgets need an explicit currency model before relying on every cross-currency total.
- Import validates links and numeric fields, but Firestore performs remaining schema checks during each commit. A later rejected group can leave a partial import; the same file resumes it. Export is not a point-in-time database snapshot while another client is writing.
- Reversal snapshots support the app workflow; client-maintained balances and audit records are not a tamper-proof accounting system. An authoritative backend is required for that guarantee.

The UID-scoped local keys deliberately do not auto-assign older unscoped drafts to the current user. Recover older local-only drafts only after identifying their owner.

## Ledger safety and review update — 22 October 2026

- Linked card, loan, goal and bill payments reject mismatched account currencies before writing. New records retain their currency; legacy records without currency use LKR. Use an explicit cross-currency transfer into the correct account first.
- Loans, cards and goals with payment history or recurring references cannot be deleted. Durable history markers also protect new payment/deletion races. UI errors explain the restriction.
- Transaction summaries exclude reversed payments and their compensating entries while preserving searchable audit rows. Added Active / Reversed / Reversal filters.
- Accounts now expose ledger reconciliation using saved opening balances, native transfer amounts and fees. New accounts capture their opening balance. Legacy accounts without a baseline are explicitly marked for review. Statement adjustments always create a ledger entry and reject stale balances.
- Backup IDs are scoped by importing user. Restore preview validates references, lists section counts and previously imported records, and blocks incomplete linked groups. Existing imports from the previous ID scheme can resume without duplicating their records.
- Added isolated Playwright workflows for card payment/reversal, offline draft synchronization and backup preview/resume on desktop and mobile. The test-only Vite configuration substitutes an in-memory Firestore adapter and is separate from the production build.

Verification: 45 frontend and 10 backend tests pass; frontend lint, production/PWA build and browser-fixture compilation pass. Browser execution was attempted, but all six cases were blocked before page load: macOS denied Chromium's MachPortRendezvous bootstrap permission. These browser cases are **not verified as passing**. Firebase authentication/rules and real-service workflows remain subject to the release gates above.

To run browser checks in an environment that permits Chromium: from `frontend`, run `npm exec -- playwright install chromium`, then `npm run test:browser`. This checks the UI and application integration against isolated test data; it does not replace Firebase emulator tests. Legacy opening balances and mixed-currency secondary summaries remain explicit limitations.

## Browser verification follow-up — 23 October 2026

The in-app browser successfully exercised the real Accounts, Transactions, Cards and Settings components using the isolated in-memory adapter. Verified a LKR 25 card payment and reversal, zero reconciliation differences, rejection of a backup with a missing account reference, and a successful valid account restore. These checks do not exercise production Firebase.

Additional fixes: Accounts spending excludes reversed audit entries; the inactive offline banner no longer appears to assistive technology; Settings and Dashboard backup reminders use the actual health-status fields instead of displaying `undefined` days. Browser tests now click the payment record rather than its note-filter shortcut and assert separate expected/recorded/difference cells. The test server routes page refreshes back to its isolated entry point.

Latest checks: all 45 frontend tests pass, lint passes, and the production/PWA build passes. The previously passing 10 backend tests are unchanged. Full Playwright desktop/mobile execution remains blocked by Chromium launch permissions; offline browser synchronization and repeat-restore browser execution are still unverified. Unit/API tests cover draft retry idempotency and deterministic import planning. Firebase emulator/authentication validation remains outstanding.

## Invoice and account consistency improvements — 23 October 2026

- Invoice settlement now commits paid status, selected account credit and a linked income transaction atomically. Stable payment IDs prevent duplicate retry/concurrent credits. Invalid, archived, foreign-user and mismatched-currency accounts are rejected. Settled invoices and their payment records cannot be overwritten or deleted through ordinary editing workflows.
- Invoice currency is explicit. Settlement offers matching active accounts, and empty invoice lists no longer create a fictitious sample invoice. Invoice saves/deletes require a connection and report failures instead of claiming a cloud save succeeded. Previously saved invoices remain available for offline viewing. Legacy paid invoices without a linked deposit require manual review; they are not credited again automatically.
- Backup planning remaps invoice/payment links and imports each settlement pair together. Broken reciprocal links are rejected before writes.
- Account details editing excludes balances and opening balances. Renaming during a simultaneous payment preserves the new balance. Currency is fixed after account creation; use a separate account for another currency. Balance adjustments go through the existing audited reconciliation flow.
- Legacy accounts can set a verified opening balance once, with instructions to use the balance before the first imported transaction and a preview of the expected current balance. The operation never changes the current balance and rejects stale account state.
- Account history charts and reconciliation now share native balance-movement calculations, including received transfer amounts and fees. Spending labels use each account's own currency; bar lengths compare only within that currency.
- Removed disconnected Recurring handlers and the unused navigation variable; lint is clean.

Validation: 51 frontend tests pass, including concurrent invoice submissions, failed settlement rollback, account rename/payment races, one-time baseline validation, native chart movements and invoice backup linkage. Production/PWA build and lint pass. The 10 previously passing backend tests cover unchanged backend code. In-app browser checks with isolated test data confirmed a LKR 55 deposit into the selected bank account, exact reconciliation and legacy baseline setup. Invoice view was inspected at 390px mobile width. Added desktop/mobile Playwright cases for invoice settlement and baseline setup; the full automated browser suite and real Firebase auth/rules gate remain unverified because of the previously documented environment restrictions.

## Minimal interface update — 24 October 2026

Presentation-only update: Dashboard starts in Overview without altering stored preferences; Detailed view and expanded insights remain available. Secondary dashboard/account actions are grouped into keyboard-accessible tool disclosures. Transaction search and totals stay visible while filters, templates and saved searches expand on demand; collapsed filters show an applied-state indicator. Settings sections and planning navigation are grouped into expandable sections. Mobile controls wrap, menus expand within the screen, and overview surfaces use calmer colors and spacing. Also restored a missing Bills icon import found during UI checks.

Financial utility files were hash-checked against the pre-edit snapshot and are unchanged. No live database or user-data operations were performed. All 51 frontend tests pass; production/PWA build and lint for changed components pass. Existing lint warnings remain in unrelated GoalHistoryModal, RecurringHistoryModal and Recurring files. Browser automation is unavailable for this turn, so the new layout has not received a fresh visual browser check. Existing browser workflows were updated to open the new disclosures before using their controls.
