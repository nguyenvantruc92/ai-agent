import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { uploadRoot } from '@/features/knowledge/files';
import { env } from '@/lib/env';

export const MAX_IMAGES_PER_PRODUCT = 8;

const formats = [
  { ext: '.jpg', mime: 'image/jpeg', matches: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', mime: 'image/png', matches: (b: Buffer) => b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: '.webp', mime: 'image/webp', matches: (b: Buffer) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

/** Only the file signature decides the type; the client-supplied name and MIME are not trusted. */
export function detectImage(bytes: Buffer) {
  if (bytes.byteLength > env.PRODUCT_IMAGE_MAX_BYTES) throw new Error(`Ảnh vượt quá ${Math.round(env.PRODUCT_IMAGE_MAX_BYTES / 1_048_576)} MB.`);
  const format = formats.find((candidate) => candidate.matches(bytes));
  if (!format) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP hợp lệ.');
  return format;
}

export const imageMimeByExt = new Map(formats.map((format) => [format.ext, format.mime]));
const fileNamePattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Storage key relative to data/uploads; the random file name makes the URL immutable. */
export async function saveProductImage(productId: string, ext: string, bytes: Buffer) {
  const key = `products/${productId}/${randomUUID()}${ext}`;
  await mkdir(join(uploadRoot, 'products', productId), { recursive: true });
  await writeFile(join(uploadRoot, key), bytes, { flag: 'wx' });
  return key;
}

/** Resolves a public media URL to a file, rejecting anything that is not exactly products/<uuid>/<uuid>.<ext>. */
export async function readProductImage(productId: string, file: string) {
  if (!uuidPattern.test(productId) || !fileNamePattern.test(file)) return null;
  const ext = file.slice(file.lastIndexOf('.'));
  try { return { bytes: await readFile(join(uploadRoot, 'products', productId, file)), mime: imageMimeByExt.get(ext)! }; }
  catch { return null; }
}

export const imageUrl = (storageKey: string) => `/api/media/${storageKey}`;
