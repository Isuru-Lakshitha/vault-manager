const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const schema = require('./schema');
const context = new AsyncLocalStorage();
const dataDir = process.env.MONEY_MANAGER_DATA_DIR || path.join(__dirname, 'user-data');

function openDatabase(filename) {
  const connection = new Database(filename);
  connection.pragma('foreign_keys = ON');
  connection.exec(schema);
  return connection;
}
function withUserDatabase(uid, callback) {
  if (typeof uid !== 'string' || !uid) throw new Error('Authenticated user required');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, createHash('sha256').update(uid).digest('hex') + '.sqlite');
  const connection = openDatabase(filename);
  return context.run({ connection, filename }, () => callback(connection));
}
module.exports = new Proxy({ withUserDatabase, openDatabase }, {
  get(target, key) {
    if (key in target) return target[key];
    const scope = context.getStore();
    if (!scope) throw new Error('Database access requires an authenticated request');
    if (key === 'filename') return scope.filename;
    const value = scope.connection[key];
    return typeof value === 'function' ? value.bind(scope.connection) : value;
  }
});
