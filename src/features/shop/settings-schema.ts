import { z } from 'zod';

export const settingsInput = z.object({
  shippingFeeVnd: z.coerce.number().int('Phí giao hàng phải là số nguyên.').min(0).max(1_000_000),
  freeShippingFromVnd: z.coerce.number().int('Ngưỡng miễn phí giao hàng phải là số nguyên.').min(0).max(100_000_000),
  maxOrdersPerHour: z.coerce.number().int().min(1, 'Tối thiểu 1 đơn mỗi giờ.').max(100),
});
