import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/accounting/cn.js';
import { statusLabel, statusTone } from '../../lib/accounting/format.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[rgba(59,130,246,0.35)] disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-[linear-gradient(135deg,#2563eb,#4f46e5)] text-white shadow-[0_14px_28px_rgba(37,99,235,0.28)] hover:-translate-y-0.5',
        secondary:
          'border border-[var(--ac-border)] bg-[var(--ac-surface)] text-[var(--ac-foreground)] hover:bg-[var(--ac-surface-strong)]',
        ghost: 'text-[var(--ac-muted)] hover:bg-white/10',
        danger:
          'bg-[linear-gradient(135deg,#ef4444,#f97316)] text-white shadow-[0_14px_28px_rgba(239,68,68,0.25)] hover:-translate-y-0.5',
      },
      size: {
        md: 'h-11',
        sm: 'h-9 rounded-xl px-3 text-xs',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function SurfaceCard({ className, children }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-[var(--ac-border)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow)] backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <span className="inline-flex rounded-full border border-[var(--ac-border)] bg-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--ac-subtle)]">
            {eyebrow}
          </span>
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ac-foreground)] md:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-[var(--ac-muted)]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status, children }) {
  const tone = statusTone(status);
  const palette =
    tone === 'success'
      ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-600'
      : tone === 'danger'
        ? 'border-rose-400/25 bg-rose-500/12 text-rose-600'
        : 'border-amber-400/25 bg-amber-500/12 text-amber-600';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', palette)}>
      {children || statusLabel(status)}
    </span>
  );
}

export function StatCard({ icon: Icon, title, value, delta, tone = 'primary', description }) {
  const toneClass =
    tone === 'success'
      ? 'from-emerald-500/20 to-emerald-200/0 text-emerald-600'
      : tone === 'danger'
        ? 'from-rose-500/20 to-rose-200/0 text-rose-600'
        : tone === 'warning'
          ? 'from-amber-500/20 to-amber-200/0 text-amber-600'
          : 'from-blue-500/20 to-violet-300/0 text-blue-600';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="rounded-[28px] border border-[var(--ac-border)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[var(--ac-muted)]">{title}</p>
          <div>
            <div className="text-2xl font-semibold tracking-tight text-[var(--ac-foreground)] md:text-[2rem]">{value}</div>
            {description ? <p className="mt-1 text-xs text-[var(--ac-subtle)]">{description}</p> : null}
          </div>
        </div>
        {Icon ? (
          <div className={cn('rounded-2xl bg-gradient-to-br p-3 shadow-inner', toneClass)}>
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
        ) : null}
      </div>
      {delta ? <div className="mt-4 text-xs font-medium text-[var(--ac-subtle)]">{delta}</div> : null}
    </motion.div>
  );
}

export function EmptyState({ title, description, action = null }) {
  return (
    <SurfaceCard className="flex min-h-52 flex-col items-center justify-center text-center">
      <h3 className="text-lg font-semibold text-[var(--ac-foreground)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--ac-muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </SurfaceCard>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-[28px] border border-[var(--ac-border)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow)]"
        />
      ))}
    </div>
  );
}

export function GlassTable({ children }) {
  return (
    <SurfaceCard className="overflow-hidden p-0">
      <div className="accounting-scrollbar overflow-auto">{children}</div>
    </SurfaceCard>
  );
}

export function AppDialog({ open, onOpenChange, title, description, children, footer = null }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="accounting-dialog-overlay" />
        <Dialog.Content className="accounting-dialog-content rounded-[32px] border border-[var(--ac-border)] bg-[var(--ac-surface-strong)] p-6 shadow-[var(--ac-shadow)] backdrop-blur-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-[var(--ac-foreground)]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-2 text-sm text-[var(--ac-muted)]">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-2xl border border-[var(--ac-border)] bg-white/10 p-2 text-[var(--ac-muted)] transition hover:bg-white/20"
                aria-label="Yopish"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div>{children}</div>
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
