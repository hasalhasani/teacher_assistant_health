// Prints the value for the PASSWORD_HASH secret:
//   node scripts/hash-password.mjs
//   npx wrangler secret put PASSWORD_HASH
// The password is read from the prompt, not from an argument, so it stays out
// of the shell history. It is shown on screen while you type.
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../worker/auth.js';

const prompt = createInterface({ input: process.stdin, output: process.stderr });
const password = await prompt.question('Password: ');
prompt.close();
if (password.length < 12) {
  console.error('Use at least 12 characters: this one password guards the whole dashboard.');
  process.exit(1);
}
console.log(await hashPassword(password));
