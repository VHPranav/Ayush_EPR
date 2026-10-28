import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Validate content independently of the browser's MIME header. Office/archive formats are
// intentionally excluded until a sandboxed malware scanning service is configured.
export async function validateUpload(file) {
  const b = await readFile(file.path);
  const ext = path.extname(file.originalname).toLowerCase();
  const starts = hex => b.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  let mime;
  if (ext === '.pdf' && b.subarray(0,5).toString() === '%PDF-' && b.subarray(-1024).includes(Buffer.from('%%EOF'))) mime = 'application/pdf';
  if (ext === '.png' && starts('89504e470d0a1a0a')) mime = 'image/png';
  if (['.jpg','.jpeg'].includes(ext) && starts('ffd8ff')) mime = 'image/jpeg';
  if (ext === '.gif' && ['GIF87a','GIF89a'].includes(b.subarray(0,6).toString())) mime = 'image/gif';
  if (ext === '.webp' && b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
  if (['.txt','.csv'].includes(ext) && b.length && !b.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(b); mime = ext === '.csv' ? 'text/csv' : 'text/plain'; } catch {}
  }
  if (!mime) throw Object.assign(new Error('File contents do not match a supported PDF, image, or UTF-8 text file'), { status: 400 });
  return mime;
}
