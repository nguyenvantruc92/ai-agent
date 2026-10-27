import { sql } from '@/db/client';
import { resetSeedOrders } from '@/features/orders/repository';

/** Restores the 12 demo orders with delivery dates relative to now and clears their requests/approvals. */
async function main() {
  console.log(`Reset ${await resetSeedOrders()} demo orders`);
  await sql.end();
}

void main();
