import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Tomodev Fashion', template: '%s · Tomodev' },
  description: 'Thời trang nam tối giản, có trợ lý AI tư vấn size và chính sách cửa hàng.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
