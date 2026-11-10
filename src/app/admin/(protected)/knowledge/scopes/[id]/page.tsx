import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { ScopeForm } from '@/components/admin/scope-form';
import { ArrowLeftIcon } from '@/components/admin-ui/icons';
import { assignableDocuments, getScope } from '@/features/knowledge/scopes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Knowledge scope · Admin' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = uuid.test(id) ? await getScope(id) : undefined;
  if (!scope) notFound();
  return (
    <div className="space-y-6">
      <Link href="/admin/knowledge" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"><ArrowLeftIcon className="size-4" />Knowledge</Link>
      <PageHeader title={scope.name} description={<>Tool <code className="text-xs">{scope.tool_name}</code></>} />
      <ScopeForm key={scope.updated_at} scope={{ ...scope, documentIds: scope.documents.map((document) => document.id) }} documents={await assignableDocuments()} />
    </div>
  );
}
