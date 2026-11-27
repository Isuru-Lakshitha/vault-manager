// One-time setup: mark one Firebase account as the app's Super Admin by
// giving it an `admin: true` custom claim. firestore.rules and the app check
// this claim instead of an email address.
//
// Usage (from the backend folder, with a service-account key that you keep
// outside the repo and never commit):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node set-admin.js you@example.com
//   ... node set-admin.js you@example.com --remove   (take admin away)
//
// Then sign out and sign in again so the new claim reaches the app.
'use strict';
const admin = require('firebase-admin');

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email || !email.includes('@')) {
    console.error('Usage: node set-admin.js <email> [--remove]');
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account key file first.');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const user = await admin.auth().getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  if (flag === '--remove') delete claims.admin;
  else claims.admin = true;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`${flag === '--remove' ? 'Removed admin from' : 'Made admin:'} ${email} (uid ${user.uid}). Sign out and in again to apply.`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
