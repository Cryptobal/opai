'use client';

import { LayoutDashboard } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

/**
 * TemplatesDropdown - Selector de templates en el topbar
 * 
 * Permite seleccionar el template a visualizar desde un dropdown.
 */
export function TemplatesDropdown() {
  const templates = [
    {
      id: 'commercial',
      label: 'Presentación Comercial',
      href: '/templates/commercial/preview?admin=true',
    },
    {
      id: 'email',
      label: 'Template Email',
      href: '/templates/email/preview',
    },
    {
      id: 'pricing',
      label: 'Formato de Pricing',
      href: '/templates/pricing-format',
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Templates</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {templates.map((template) => (
          <DropdownMenuItem key={template.id} asChild>
            <a
              href={template.href}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              {template.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
