import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-slate-950 text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.85)] hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100',
        secondary:
          'border border-white/50 bg-white/70 text-slate-700 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900',
        ghost:
          'text-slate-600 hover:bg-slate-950/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
        success:
          'bg-emerald-500 text-white shadow-[0_16px_40px_-24px_rgba(16,185,129,0.85)] hover:-translate-y-0.5 hover:bg-emerald-400',
        danger:
          'bg-rose-500 text-white shadow-[0_16px_40px_-24px_rgba(244,63,94,0.85)] hover:-translate-y-0.5 hover:bg-rose-400',
      },
      size: {
        sm: 'h-10 px-4',
        default: 'h-11 px-5',
        lg: 'h-12 px-6',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));

Button.displayName = 'Button';

export { Button, buttonVariants };
