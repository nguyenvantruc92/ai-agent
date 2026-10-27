import { createPasswordHash } from '@/features/auth/session';

async function main() {
  const password = process.argv[2];
  if (!password) throw new Error('Cách dùng: pnpm admin:password "mật-khẩu-mới"');
  console.log(await createPasswordHash(password));
}

void main();
