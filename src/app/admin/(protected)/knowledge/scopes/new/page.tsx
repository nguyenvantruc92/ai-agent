import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { ScopeForm } from '@/components/admin/scope-form';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';
import { assignableDocuments } from '@/features/knowledge/scopes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Thêm scope · Admin' };

export default async function NewScopePage() {
  return (
    <div className="space-y-6">
      <Link href="/admin/knowledge" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />Knowledge</Link>
      <PageHeader title="Thêm Knowledge scope" description="Chọn các file thuộc scope và đặt tên + mô tả tool để AI biết khi nào cần tra." />
      <ScopeForm documents={await assignableDocuments()} />
    </div>
  );
}
