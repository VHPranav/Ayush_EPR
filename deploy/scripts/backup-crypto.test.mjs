import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crypt,keygen } from './backup-crypto.mjs';

test('encrypted recovery round trip, wrong key and tampering fail without publishing plaintext',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ayush-backup-test-'));
  const f=n=>path.join(dir,n);
  try {
    await keygen(f('key')); await keygen(f('other-key'));
    await assert.rejects(keygen(f('key')));
    const source=Buffer.alloc(1024*1024+17,42);
    await writeFile(f('source'),source);
    await crypt('encrypt',f('source'),f('encrypted'),f('key'));
    await crypt('decrypt',f('encrypted'),f('restored'),f('key'));
    assert.deepEqual(await readFile(f('restored')),source);
    await assert.rejects(crypt('decrypt',f('encrypted'),f('wrong'),f('other-key')));
    await assert.rejects(stat(f('wrong')));
    const corrupt=await readFile(f('encrypted')); corrupt[100]^=1;
    await writeFile(f('corrupt'),corrupt);
    await assert.rejects(crypt('decrypt',f('corrupt'),f('damaged'),f('key')));
    await assert.rejects(stat(f('damaged')));
    await assert.rejects(crypt('decrypt',f('encrypted'),f('restored'),f('key')));
    assert.deepEqual(await readFile(f('restored')),source);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
