import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  /** Texto del label */
  label: string;
  /** ID del input asociado */
  htmlFor?: string;
  /** Muestra asterisco rojo indicando campo obligatorio */
  required?: boolean;
  /** Mensaje de error de validación */
  error?: string;
  /** Texto de ayuda debajo del input */
  description?: string;
  /** El input o control del formulario */
  children: ReactNode;
  className?: string;
}

/**
 * FormField - Wrapper label + input con spacing estandarizado
 *
 * Reemplaza los labels con mb-1 (4px) por space-y-1.5 (6px)
 * para mejorar la legibilidad de los formularios.
 *
 * @example
 * ```tsx
 * <FormField label="Email" htmlFor="email" required error={errors.email}>
 *   <Input id="email" type="email" placeholder="correo@ejemplo.com" />
 * </FormField>
 * ```
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  description,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
      {description && !error && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </div>
  );
}
