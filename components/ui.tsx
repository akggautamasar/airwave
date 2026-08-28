'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon, MoonIcon, SunIcon } from './Icons';
import { useTheme } from '@/hooks/useTheme';

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonTone = 'primary' | 'quiet' | 'ghost' | 'danger';

const TONE: Record<ButtonTone, string> = {
  primary:
    'bg-signal text-on-signal hover:brightness-105 active:brightness-95 border-transparent',
  quiet: 'bg-raised text-ink border-line hover:border-dim',
  ghost: 'bg-transparent text-dim border-transparent hover:text-ink hover:bg-raised',
  danger: 'bg-transparent text-alert border-alert/40 hover:bg-alert/10',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  /** Condensed uppercase treatment, for primary instrument actions. */
  label?: boolean;
  children: ReactNode;
}

export function Button({
  tone = 'quiet',
  label = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center gap-2 rounded border px-4 py-2.5',
        'text-sm transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        label ? 'label text-[0.8rem]' : 'font-medium',
        TONE[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Eyebrow + readouts                                                         */
/* -------------------------------------------------------------------------- */

export function Eyebrow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`label text-2xs text-faint ${className}`}>{children}</p>
  );
}

/** A small paired number and unit, set in mono so it scans as an instrument. */
export function Readout({
  value,
  unit,
  tone = 'dim',
}: {
  value: number | string;
  unit: string;
  tone?: 'dim' | 'signal' | 'carrier';
}) {
  const color =
    tone === 'signal' ? 'text-signal' : tone === 'carrier' ? 'text-carrier' : 'text-dim';
  return (
    <span className={`readout text-xs ${color}`}>
      {value}
      <span className="ml-1 text-faint">{unit}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Renders the value in mono and uppercases as you type, for channel codes. */
  codeStyle?: boolean;
}

export function Field({
  label,
  hint,
  error,
  codeStyle = false,
  className = '',
  ...rest
}: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label text-2xs text-dim">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'w-full rounded border bg-base px-3 py-2.5 text-ink',
          'placeholder:text-faint transition-colors',
          codeStyle ? 'readout uppercase tracking-[0.3em]' : '',
          error ? 'border-alert' : 'border-line focus:border-carrier',
          className,
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                      */
/* -------------------------------------------------------------------------- */

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet on phones, centred panel from small screens up. Phones get the
 * sheet because the controls end up under the thumb rather than at the top of
 * a tall screen.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the sheet so keyboard and screen reader users land here.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative w-full sm:max-w-md',
          'border-t border-line bg-panel shadow-sheet',
          'sm:rounded-lg sm:border',
          'animate-slide-up sm:animate-rise',
          'max-h-[90dvh] overflow-y-auto thin-scroll',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="label text-sm text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-faint transition-colors hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="dock-pad px-5 pt-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner                                                                     */
/* -------------------------------------------------------------------------- */

export function Banner({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const skin =
    tone === 'error'
      ? 'border-alert/50 bg-alert/10 text-alert'
      : tone === 'warn'
        ? 'border-signal/50 bg-signal/10 text-signal'
        : 'border-carrier/40 bg-carrier/10 text-carrier';

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded border px-3.5 py-3 text-sm ${skin}`}
    >
      <p className="flex-1">{children}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="opacity-70 transition-opacity hover:opacity-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Theme toggle                                                               */
/* -------------------------------------------------------------------------- */

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'daylight' : 'night';

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next}`}
      aria-label={`Switch to ${next}`}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded border border-line',
        'text-dim transition-colors hover:text-ink',
        className,
      ].join(' ')}
    >
      {theme === 'dark' ? (
        <SunIcon className="h-4.5 w-4.5" />
      ) : (
        <MoonIcon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
