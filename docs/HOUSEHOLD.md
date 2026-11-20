# Shared household access: design

**Status:** proposal; not built yet. It changes who can read financial data, so it needs a decision on the open questions below before any code or security-rule change.

## Goal

Two or more people (for example partners) see and edit the same accounts, transactions, budgets and bills, while each keeps their own login, PIN and preferences.

## Today

Every record carries the owner's `uid`, and `firestore.rules` only lets that user read or write it (`resource.data.uid == request.auth.uid`). Collections are top-level (`accounts`, `transactions`, …) plus some under `users/{uid}/…` (bills, investments, invoices).

## Proposed model

1. **`households/{householdId}`** document:
   ```
   { name, owner: uid, members: { <uid>: 'owner' | 'editor' | 'viewer' }, created_at }
   ```
2. **Shared records** get a `household_id` field next to `uid`. Personal records simply don't have one, so nothing changes for people who never share.
3. **Rules:** a record is readable when `uid == auth.uid` **or** the caller is a member of `household_id`; writable by owners and editors; `uid` and `household_id` are immutable after creation (same pattern the rules already use for `uid`).
   ```
   function inHousehold(hid, roles) {
     return hid is string &&
       get(/databases/$(database)/documents/households/$(hid)).data.members[request.auth.uid] in roles;
   }
   allow read:  if owns(resource) || inHousehold(resource.data.household_id, ['owner','editor','viewer']);
   allow write: if owns(resource) || inHousehold(resource.data.household_id, ['owner','editor']);
   ```
4. **Invites:** the owner creates `households/{id}/invites/{code}` (single-use, expires in 7 days). The invitee signs in and redeems the code; a rule allows adding exactly their own `uid` as `editor` when a valid invite exists.
5. **App:** a "Household" section in Settings (create, invite, members, leave or remove), a personal/household switch, and the data layer querying `where('household_id', '==', id)` in addition to `where('uid', '==', me)`.
6. **Balances:** transfers between two members' accounts work as long as both accounts are in the household; the existing atomic ledger code stays the same.

## Open questions (your call)

1. **What is shared?** Everything, or chosen accounts only (recommended: chosen accounts, and their transactions follow)?
2. **Roles:** is "viewer" (read-only) needed, or just owner and editor?
3. **Leaving:** when someone leaves, do shared records stay with the household (recommended) or go with their creator?
4. **Existing data:** offer a one-time "move these accounts into the household" step?

## Cost and risk

- Each shared read costs one extra document lookup in the rules (`get()` on the household); Firestore caches it per request.
- New rule tests (emulator) for member, non-member, viewer write attempts, invite misuse and immutable fields, all before deploying.
- Estimated as one focused project: data layer, rules with tests, and the Settings UI.
