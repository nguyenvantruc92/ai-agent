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

export type ExistingRequest = { id: string; type: RequestAction; productId: string; requestedSize: string | null; reason: string | null; status: string; idempotencyKey: string; createdAt: string; itemSize?: string | null; itemColor?: string | null };

export type Order = {
  id: string;
  status: 'processing' | 'shipping' | 'delivered' | 'cancelled';
  orderedAt: string;
  deliveredAt: string | null;
  paymentMethod: string;
  /** unpaid | paid | failed | refunded; absent for orders that pre-date payments. */
  paymentStatus?: string;
  totalVnd?: number;
  /** Processing and unpaid: the customer may still cancel it. */
  canCancel?: boolean;
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
  /** Live stock per size/colour (absent in tests). */
  variants?: { size: string; color: string; stock: number }[];
};

export type RequestAction = 'exchange_size' | 'return';
export const returnReasons = ['wrong_item', 'wrong_size_or_color', 'manufacturing_defect'] as const;
export type ReturnReason = (typeof returnReasons)[number];

/** `itemSize`/`itemColor` pick one line when an order holds the same product several times. */
type LineSelector = { itemSize?: string; itemColor?: string };
export type RequestProposal =
  | ({ action: 'exchange_size'; orderId: string; productId: string; requestedSize: string } & LineSelector)
  | ({ action: 'return'; orderId: string; productId: string; reason: string } & LineSelector);
