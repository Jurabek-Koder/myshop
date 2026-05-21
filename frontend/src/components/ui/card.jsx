import React from 'react';
import { cn } from '../../lib/cn.js';

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-[28px] border border-white/55 bg-white/72 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/72 dark:shadow-[0_30px_80px_-40px_rgba(2,6,23,0.88)]',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-2 p-5 sm:p-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-lg font-semibold tracking-tight text-slate-900 dark:text-white', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-slate-500 dark:text-slate-400', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
