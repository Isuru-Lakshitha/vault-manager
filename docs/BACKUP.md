# Vault Manager — Backup & Recovery Guide

## 1. Zero-Cost Client-Side Vault Backups (Spark Free Tier)

Every signed-in user can export and restore their personal financial vault without requiring paid cloud storage or Blaze billing:

- **Locations**:
  - **Settings → Local Vault Backup**: Export plain JSON or on-device encrypted `.vault.json` (PBKDF2 + AES-256-GCM).
  - **Super Admin Command Center → Maintenance & Controls → Your data backup**: Quick 1-tap JSON backup and reminder interval configuration.
- **Automated Backup Reminder**:
  - The app tracks the last backup timestamp (`vm_last_backup_ts`) and reminder interval (`vm_backup_reminder_days`, default `7` days).
  - When a backup is overdue or has never been taken, a notification surfaces in the top-bar **AlertCenter** with 1-day snooze and dismiss controls.
- **Deterministic Restore**:
  - Restores validate references, deduplicate receipts and atomic fee groups, and preserve reversal audit links before writing to Firestore.

---

## 2. Managed Cloud Firestore Scheduled Backups (`gcloud`)

> **Note**: Native Cloud Firestore Point-in-Time Recovery (PITR) and scheduled backups require the Firebase **Blaze (pay-as-you-go)** plan. Do not run these commands if you wish to keep the project strictly on the free Spark tier.

### Enable Daily or Weekly Scheduled Backups

```bash
# Authenticate and select project
gcloud auth login
gcloud config set project money-manager-isuru

# Create a weekly backup schedule retaining backups for 4 weeks (28 days)
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=weekly \
  --day-of-week=SUN \
  --retention=28d

# List active backup schedules
gcloud firestore backups schedules list --database='(default)'

# List available backups
gcloud firestore backups list --format="table(name, database, state, snapshotTime, expireTime)"
```

### Restore from a Managed Cloud Backup into a Recovery Database

```bash
gcloud firestore databases restore \
  --source-backup="projects/money-manager-isuru/locations/NAM5/backups/BACKUP_ID" \
  --destination-database="recovery-db"
```
