/**
 * SACONE Owner key: make a new one (the old one stops working), show whether one is set, or
 * remove it. Run on the server PC:
 *   npm run owner-key            new key (printed once — keep it private)
 *   npm run owner-key -- status  is a key set, and its last 4 characters
 *   npm run owner-key -- off     remove the key (SACONE Owner cannot be opened)
 */
import { runMigrations } from '../database/setup.js';
import { closeDatabase, getDatabase } from '../database/connection.js';
import { createOwnerKey, ownerKeyStatus, removeOwnerKey } from '../services/owner-key.js';

const cmd = (process.argv[2] || 'new').toLowerCase();
runMigrations(getDatabase(), { quiet: true }); // owner_access table (main database)

if (cmd === 'status') {
  const s = ownerKeyStatus();
  console.log(s.set ? `Owner key is set (ends with ${s.endsWith}, made ${s.createdAt}).` : 'No owner key is set.');
} else if (cmd === 'off') {
  console.log(removeOwnerKey() ? 'Owner key removed. SACONE Owner cannot be opened until you make a new one.' : 'No owner key was set.');
} else {
  const key = createOwnerKey();
  console.log('\nNew SACONE Owner key (shown only now — keep it private; the old key no longer works):\n');
  console.log(`   ${key}\n`);
  console.log('Open SACONE Owner and enter this key.\n');
}
closeDatabase();
