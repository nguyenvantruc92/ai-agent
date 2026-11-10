import { redirect } from 'next/navigation';

// The chat now lives in a floating widget on every storefront page; keep the old URL working.
export default function ChatPage() { redirect('/?chat=1'); }
