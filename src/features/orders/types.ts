export type OrderItem = {
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  unitPriceVnd: number;
  discountPercent: number;
  isOpened: boolean;
};

export type ExistingRequest = { id: string; type: RequestAction; productId: string; requestedSize: string | null; reason: string | null; status: string; idempotencyKey: string; createdAt: string };

export type Order = {
  id: string;
  status: 'processing' | 'shipping' | 'delivered' | 'cancelled';
  orderedAt: string;
  deliveredAt: string | null;
  paymentMethod: string;
  items: OrderItem[];
  requests: ExistingRequest[];
};

export type Product = {
  productId: string;
  name: string;
  category: string;
  priceVnd: number;
  sizes: string[];
  colors: string[];
  stockStatus: string;
  updatedAt: string;
};

export type RequestAction = 'exchange_size' | 'return';
export const returnReasons = ['wrong_item', 'wrong_size_or_color', 'manufacturing_defect'] as const;
export type ReturnReason = (typeof returnReasons)[number];

export type RequestProposal =
  | { action: 'exchange_size'; orderId: string; productId: string; requestedSize: string }
  | { action: 'return'; orderId: string; productId: string; reason: string };
