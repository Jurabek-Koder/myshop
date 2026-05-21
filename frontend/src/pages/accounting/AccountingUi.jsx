import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from './cn.js';

export function GlassCard({ className, children }) {
  return <div className={cn('accounting-glass rounded-2xl border border-white/10 p-4 md:p-5', className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle, rightSlot }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-white md:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
      </div>
      {rightSlot}
    </div>
  );
}

export function Badge({ status, label }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        status,
      )}
    >
      {label}
    </span>
  );
}

export function PrimaryButton({ className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function SecondaryButton({ className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({ title, description }) {
  return (
    <GlassCard className="border-dashed text-center">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </GlassCard>
  );
}

export function LoadingRows({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="h-14 animate-pulse rounded-xl bg-white/10" />
      ))}
    </div>
  );
}

export function ActionModal({ open, onOpenChange, title, description, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-slate-900 p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-slate-300">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-white/15 p-1.5 text-slate-300 transition hover:bg-white/10"
                aria-label="Yopish"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
