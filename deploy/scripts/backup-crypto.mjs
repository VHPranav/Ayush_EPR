import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const magic = Buffer.from('AYUSHBK1');
export async function keygen(file) {
  await writeFile(file, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
}
export async function crypt(mode, input, output, keyPath) {
  if (!['encrypt','decrypt'].includes(mode)) throw new Error('Invalid mode');
  const keyText = (await readFile(keyPath, 'utf8')).trim();
  if (!/^[0-9a-f]{64}$/i.test(keyText)) throw new Error('Expected a 32-byte hex key file');
  const key = Buffer.from(keyText, 'hex');
  const part = output + '.' + randomBytes(8).toString('hex') + '.partial';
  let handle, created = false;
  try {
    // Refuse overwrite, including concurrent invocations.
    handle = await open(output, 'wx', 0o600);
    created = true;
    if (mode === 'encrypt') {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(magic);
      await writeFile(part, Buffer.concat([magic,iv]), { mode: 0o600, flag: 'wx' });
      await pipeline(createReadStream(input), cipher, createWriteStream(part, { flags: 'a', mode: 0o600 }));
      const file = await open(part, 'a');
      try { await file.write(cipher.getAuthTag()); await file.sync(); } finally { await file.close(); }
    } else {
      const size = (await stat(input)).size;
      if (size < 36) throw new Error('Truncated backup');
      const file = await open(input, 'r');
      const header = Buffer.alloc(20), tag = Buffer.alloc(16);
      try { await file.read(header,0,20,0); await file.read(tag,0,16,size-16); } finally { await file.close(); }
      if (!header.subarray(0,8).equals(magic)) throw new Error('Unknown backup format');
      const cipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
      cipher.setAAD(magic); cipher.setAuthTag(tag);
      await pipeline(createReadStream(input,{start:20,end:size-17}),cipher,createWriteStream(part,{flags:'wx',mode:0o600}));
    }
    await handle.close(); handle = null;
    await rename(part, output);
  } catch (error) {
    if (handle) await handle.close();
    if (created) await rm(output,{force:true});
    await rm(part,{force:true});
    throw error;
  } finally { key.fill(0); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode,input,output,key] = process.argv.slice(2);
    if (mode === 'keygen' && input && !output) await keygen(input);
    else if (['encrypt','decrypt'].includes(mode) && input && output && key) await crypt(mode,input,output,key);
    else throw new Error('Usage: node backup-crypto.mjs keygen KEY | encrypt/decrypt INPUT OUTPUT KEY');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
