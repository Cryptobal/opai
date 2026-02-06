/**
 * Template Preview Page - Vista de template para admin
 * URL: /templates/commercial/preview?admin=true
 */

import { TemplatePreviewWrapper } from '@/components/admin/TemplatePreviewWrapper';
import { getMockPresentationPayload } from '@/lib/mock-data';
import { redirect } from 'next/navigation';

interface TemplatePreviewPageProps {
  searchParams: Promise<{
    admin?: string;
    theme?: 'executive' | 'ops' | 'trust';
  }>;
}

export default async function TemplatePreviewPage(props: TemplatePreviewPageProps) {
  const searchParams = await props.searchParams;
  
  // Solo accesible con ?admin=true (por ahora, luego con auth)
  if (searchParams.admin !== 'true') {
    redirect('/opai');
  }
  
  // Obtener payload base
  const payload = getMockPresentationPayload();
  
  // Theme desde query param
  const theme = searchParams.theme || 'executive';
  
  return (
    <TemplatePreviewWrapper
      payload={payload}
      initialTheme={theme}
      showTokensByDefault={false}
    />
  );
}

export const metadata = {
  title: 'Template Preview - Commercial | Gard Docs',
  description: 'Vista previa del template comercial',
  robots: 'noindex, nofollow',
};
