import { z } from 'zod';

export const paymentMethods = ['COD', 'bank_transfer', 'card'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentLabels: Record<string, string> = { COD: 'Thanh toán khi nhận hàng (COD)', bank_transfer: 'Chuyển khoản ngân hàng', card: 'Thẻ qua cổng thanh toán' };
export const isOnline = (method: string) => method !== 'COD';

/** "0901 234 567", "+84 901.234.567" and "84901234567" all become "0901234567"; anything else is rejected. */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[\s.\-()]/g, '');
  const local = digits.startsWith('+84') ? `0${digits.slice(3)}` : digits.startsWith('84') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  return /^0\d{9}$/.test(local) ? local : null;
}

const phone = z.string().trim().transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).' });
  return normalized ?? '';
});

export const checkoutInput = z.object({
  name: z.string().trim().min(2, 'Nhập họ và tên.').max(80),
  phone,
  address: z.string().trim().min(10, 'Nhập địa chỉ đầy đủ (số nhà, đường, phường/xã, quận/huyện, tỉnh/thành).').max(250),
  note: z.string().trim().max(300).default(''),
  paymentMethod: z.enum(paymentMethods),
  idempotencyKey: z.string().min(8).max(64),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

export const lookupInput = z.object({ code: z.string().trim().toUpperCase().min(3).max(30), phone });
export const orderActionInput = z.object({ phone: phone.optional() }).default({});
export const payInput = z.object({ outcome: z.enum(['success', 'failure']), phone: phone.optional() });
export const addToCartInput = z.object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(10).default(1) });
export const lineQuantityInput = z.object({ quantity: z.coerce.number().int().min(1).max(10) });
