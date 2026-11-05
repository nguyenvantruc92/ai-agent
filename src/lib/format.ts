const vnd = new Intl.NumberFormat('vi-VN');

/** 499000 -> "499.000₫". Prices are integer VND everywhere in the system. */
export const formatVnd = (value: number) => `${vnd.format(value)}₫`;

/** A rate-limit wait for people: "45 giây", "3 phút". Safe in client components. */
export const formatWait = (seconds: number) => seconds < 60 ? `${Math.max(1, Math.ceil(seconds))} giây` : `${Math.ceil(seconds / 60)} phút`;
