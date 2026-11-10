import { isOnline, paymentMethods, type PaymentMethod } from '@/features/orders/customer-schemas';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';

/**
 * Whether customers can pay online. Today the only "gateway" is the simulation, where the customer chooses the
 * outcome, so it must stay off in production. A real provider (webhook-confirmed) will be the other way to enable it.
 * Read on every call so tests can switch it.
 */
export const onlinePaymentEnabled = () => env.PAYMENT_SIMULATION_ENABLED;

export const availablePaymentMethods = (): PaymentMethod[] => paymentMethods.filter((method) => !isOnline(method) || onlinePaymentEnabled());

export const ONLINE_PAYMENT_UNAVAILABLE = 'Hiện cửa hàng chỉ nhận thanh toán khi nhận hàng (COD); thanh toán online đang tạm ngưng.';

/** Server-side gate for every order creation (web checkout and agent checkout), whatever the client offered. */
export function assertPaymentMethodAvailable(method: string) {
  if (isOnline(method) && !onlinePaymentEnabled()) throw new HttpError(ONLINE_PAYMENT_UNAVAILABLE, 409);
}
