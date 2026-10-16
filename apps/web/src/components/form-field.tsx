import type React from 'react';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** A label, its control, an optional hint, and the field's error, wired for screen readers (NFR-10). */
export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props that link a control to its hint or error. */
export function describedBy(id: string, { hint, error }: { hint?: string; error?: string }) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/**
 * A checkbox or radio whose accessible name is just its label; the hint is
 * linked as a description, so screen readers (and tests) get a short, exact name.
 */
export function CheckField({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="mt-1 size-4 shrink-0" {...input} />
      <div className="flex flex-col">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <span id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
