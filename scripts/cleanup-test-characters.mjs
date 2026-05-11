// One-off: sign in as the .env.test user via Supabase, list their
// characters, prompt for confirmation, then delete all of them.
// Mirrors what the UI's new delete button does, just in bulk.
//
// Usage: node scripts/cleanup-test-characters.mjs [--yes]
//   --yes  Skip the confirmation prompt.

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

loadEnv({ path: path.join(repoRoot, '.env') });
loadEnv({ path: path.join(repoRoot, '.env.test') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD })) {
  if (!v) {
    console.error(`Missing env var ${k}. Check .env / .env.test.`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { error: signInError } = await supabase.auth.signInWithPassword({
  email: TEST_USER_EMAIL,
  password: TEST_USER_PASSWORD,
});
if (signInError) {
  console.error(`Sign-in failed: ${signInError.message}`);
  process.exit(1);
}

const { data: characters, error: listError } = await supabase
  .from('characters')
  .select('id, name, system, created_at')
  .order('created_at', { ascending: false });

if (listError) {
  console.error(`List failed: ${listError.message}`);
  process.exit(1);
}

if (!characters || characters.length === 0) {
  console.log('No characters to delete.');
  process.exit(0);
}

console.log(`Found ${characters.length} character(s) under ${TEST_USER_EMAIL}:`);
for (const c of characters) {
  console.log(`  ${c.id}  ${c.name}  (${c.system}, created ${c.created_at})`);
}

const skipConfirm = process.argv.includes('--yes');
if (!skipConfirm) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`\nDelete all ${characters.length}? Type "yes" to confirm: `);
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

const ids = characters.map((c) => c.id);
const { error: deleteError } = await supabase.from('characters').delete().in('id', ids);
if (deleteError) {
  console.error(`Delete failed: ${deleteError.message}`);
  process.exit(1);
}

console.log(`Deleted ${ids.length} character(s).`);
process.exit(0);
