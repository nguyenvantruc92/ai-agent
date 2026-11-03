import { readProductImage } from '@/features/catalog/images';

type Context = { params: Promise<{ productId: string; file: string }> };

/** Public product images. File names are random UUIDs, so responses can be cached forever. */
export async function GET(_: Request, { params }: Context) {
  const { productId, file } = await params;
  const image = await readProductImage(productId, file);
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: { 'content-type': image.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}
