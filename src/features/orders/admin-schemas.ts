import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD.');

export const orderListQuery = z.object({
  status: z.enum(['processing', 'shipping', 'delivered', 'cancelled']).optional(),
  payment: z.enum(['unpaid', 'paid', 'failed', 'refunded']).optional(),
  q: z.string().trim().max(100).optional(),
  from: date.optional(),
  to: date.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const transitionInput = z.object({
  action: z.enum(['ship', 'deliver', 'cancel']),
  note: z.string().trim().max(300).default(''),
});
