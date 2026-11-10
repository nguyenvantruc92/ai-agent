import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { env } from '@/lib/env';

export const uploadRoot = join(process.cwd(), 'data', 'uploads');
export const trashRoot = join(process.cwd(), 'data', 'trash');

const accepted = new Map([
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown'],
  ['.txt', 'text/plain'],
]);

export function validateUpload(file: File, bytes: Buffer) {
  if (bytes.byteLength > env.UPLOAD_MAX_BYTES) throw new Error('File vượt quá giới hạn 10 MiB.');
  const extension = extname(file.name).toLowerCase();
  const mime = accepted.get(extension);
  const acceptedBrowserMime = extension === '.md' ? new Set(['text/markdown', 'text/plain']) : new Set([mime ?? '']);
  if (!mime || (file.type && !acceptedBrowserMime.has(file.type))) throw new Error('Chỉ nhận file PDF, Markdown, TXT hoặc XLSX hợp lệ.');
  const isPdf = bytes.subarray(0, 5).toString() === '%PDF-';
  const isXlsx = bytes.subarray(0, 4).toString('hex') === '504b0304';
  const isText = !bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0);
  if (!(extension === '.pdf' ? isPdf : extension === '.xlsx' ? isXlsx : isText)) throw new Error('Chữ ký hoặc nội dung file không hợp lệ.');
  return { extension, mime };
}

export async function saveUpload(documentId: string, extension: string, bytes: Buffer) {
  const key = join(documentId, `${randomUUID()}${extension}`);
  const absolute = join(uploadRoot, key);
  await mkdir(join(uploadRoot, documentId), { recursive: true });
  await writeFile(absolute, bytes, { flag: 'wx' });
  return { key, contentHash: createHash('sha256').update(bytes).digest('hex') };
}

export async function moveToTrash(storageKey: string) {
  const source = join(uploadRoot, storageKey);
  const target = join(trashRoot, `${randomUUID()}-${basename(storageKey)}`);
  await mkdir(trashRoot, { recursive: true });
  await rename(source, target);
}
