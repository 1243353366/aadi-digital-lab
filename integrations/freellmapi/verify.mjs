import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('./source-manifest.json', import.meta.url), 'utf8'));
if (manifest.upstreamCommit !== '4f8a95040f5921d9eee9db8e50a343fd9ec4d93d' || manifest.keyless !== true) throw new Error('Unexpected integration provenance');
for (const [name, expected] of Object.entries(manifest.sha256)) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('Invalid source path');
  const file = resolve(root, name);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024 || !(await realpath(file)).startsWith(resolve(root) + sep)) throw new Error('Unapproved source shape');
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== expected) throw new Error('Source integrity mismatch: ' + name);
}
console.log('Keyless complementary layer hashes verified. No API request, credential use or deployment.');
