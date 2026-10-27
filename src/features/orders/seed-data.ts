/** Demo orders without real PII. Delivery dates are relative to when the seed runs. */
export type SeedOrder = {
  id: string;
  status: 'processing' | 'shipping' | 'delivered' | 'cancelled';
  orderedDaysAgo: number;
  deliveredDaysAgo: number | null;
  paymentMethod: 'COD' | 'bank_transfer' | 'card';
  items: { productId: string; productName: string; size: string; color: string; quantity: number; unitPriceVnd: number; discountPercent?: number; isOpened?: boolean }[];
  existingRequest?: { productId: string; type: 'exchange_size' | 'return'; requestedSize?: string; reason?: string };
};

export const seedOrders: SeedOrder[] = [
  { id: 'FT-2026-1001', status: 'delivered', orderedDaysAgo: 5, deliveredDaysAgo: 2, paymentMethod: 'COD', items: [
    { productId: 'SM-001', productName: 'Áo sơ mi Oxford trắng dáng regular', size: 'M', color: 'Trắng', quantity: 1, unitPriceVnd: 499000 },
    { productId: 'QT-001', productName: 'Quần chinos be dáng slim taper', size: '31', color: 'Be', quantity: 1, unitPriceVnd: 549000 },
  ] },
  { id: 'FT-2026-1002', status: 'delivered', orderedDaysAgo: 6, deliveredDaysAgo: 3, paymentMethod: 'bank_transfer', items: [
    { productId: 'PL-002', productName: 'Áo polo pique trắng', size: 'L', color: 'Trắng', quantity: 1, unitPriceVnd: 389000 },
    { productId: 'TS-001', productName: 'Áo thun cotton trắng basic', size: 'M', color: 'Trắng', quantity: 2, unitPriceVnd: 249000 },
  ] },
  { id: 'FT-2026-1003', status: 'delivered', orderedDaysAgo: 15, deliveredDaysAgo: 12, paymentMethod: 'COD', items: [
    { productId: 'SM-002', productName: 'Áo sơ mi Oxford xanh nhạt dáng regular', size: 'L', color: 'Xanh nhạt', quantity: 1, unitPriceVnd: 499000 },
  ] },
  { id: 'FT-2026-1004', status: 'shipping', orderedDaysAgo: 2, deliveredDaysAgo: null, paymentMethod: 'COD', items: [
    { productId: 'JK-001', productName: 'Áo khoác bomber đen', size: 'L', color: 'Đen', quantity: 1, unitPriceVnd: 899000 },
  ] },
  { id: 'FT-2026-1005', status: 'processing', orderedDaysAgo: 0, deliveredDaysAgo: null, paymentMethod: 'card', items: [
    { productId: 'PL-003', productName: 'Áo polo pique xanh navy', size: 'M', color: 'Xanh navy', quantity: 1, unitPriceVnd: 389000 },
  ] },
  { id: 'FT-2026-1006', status: 'delivered', orderedDaysAgo: 7, deliveredDaysAgo: 4, paymentMethod: 'COD', items: [
    { productId: 'PK-004', productName: 'Tất cotton cổ trung bộ 3 đôi', size: '39–42', color: 'Đen, trắng, xám', quantity: 1, unitPriceVnd: 159000, isOpened: true },
    { productId: 'PK-003', productName: 'Mũ lưỡi trai cotton navy', size: 'Freesize', color: 'Xanh navy', quantity: 1, unitPriceVnd: 229000, isOpened: true },
  ] },
  { id: 'FT-2026-1007', status: 'delivered', orderedDaysAgo: 4, deliveredDaysAgo: 1, paymentMethod: 'card', items: [
    { productId: 'QT-005', productName: 'Quần jeans slim fit xanh đậm', size: '30', color: 'Xanh đậm', quantity: 1, unitPriceVnd: 413400, discountPercent: 40 },
  ] },
  { id: 'FT-2026-1008', status: 'delivered', orderedDaysAgo: 8, deliveredDaysAgo: 5, paymentMethod: 'COD', items: [
    { productId: 'SM-003', productName: 'Áo sơ mi linen be dáng relaxed', size: 'M', color: 'Be', quantity: 1, unitPriceVnd: 559000 },
  ], existingRequest: { productId: 'SM-003', type: 'exchange_size', requestedSize: 'L' } },
  { id: 'FT-2026-1009', status: 'delivered', orderedDaysAgo: 9, deliveredDaysAgo: 6, paymentMethod: 'bank_transfer', items: [
    { productId: 'KN-001', productName: 'Áo len cổ tròn xám than', size: 'M', color: 'Xám than', quantity: 1, unitPriceVnd: 649000 },
  ] },
  { id: 'FT-2026-1010', status: 'delivered', orderedDaysAgo: 5, deliveredDaysAgo: 2, paymentMethod: 'COD', items: [
    { productId: 'PL-004', productName: 'Áo polo dệt kim be', size: 'M', color: 'Be', quantity: 1, unitPriceVnd: 469000 },
    { productId: 'SM-004', productName: 'Áo sơ mi linen xanh rêu dáng relaxed', size: 'L', color: 'Xanh rêu', quantity: 1, unitPriceVnd: 559000 },
  ] },
  { id: 'FT-2026-1011', status: 'cancelled', orderedDaysAgo: 3, deliveredDaysAgo: null, paymentMethod: 'card', items: [
    { productId: 'JK-004', productName: 'Áo khoác blazer casual xám', size: 'L', color: 'Xám', quantity: 1, unitPriceVnd: 1199000 },
  ] },
  { id: 'FT-2026-1012', status: 'delivered', orderedDaysAgo: 4, deliveredDaysAgo: 1, paymentMethod: 'COD', items: [
    { productId: 'QT-007', productName: 'Quần jogger đen co giãn', size: 'M', color: 'Đen', quantity: 1, unitPriceVnd: 459000 },
    { productId: 'PK-001', productName: 'Thắt lưng da nâu bản 3,5 cm', size: '105 cm', color: 'Nâu', quantity: 1, unitPriceVnd: 399000 },
  ] },
];
