const vnd = new Intl.NumberFormat('vi-VN');

/** 499000 -> "499.000₫". Prices are integer VND everywhere in the system. */
export const formatVnd = (value: number) => `${vnd.format(value)}₫`;
