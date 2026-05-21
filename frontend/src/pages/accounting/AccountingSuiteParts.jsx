import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { cn } from '../../lib/cn.js';
import { resolveStatusVariant } from './accountingUtils.js';

export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="space-y-2">
        {eyebrow ? (
          <div className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            {eyebrow}
          </div>
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400 sm:text-base">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, hint, accent = 'sky', className }) {
  const gradientMap = {
    sky: 'from-sky-500/20 via-sky-500/5 to-transparent',
    emerald: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    violet: 'from-violet-500/20 via-violet-500/5 to-transparent',
    amber: 'from-amber-500/20 via-amber-500/5 to-transparent',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className={cn('relative overflow-hidden', className)}>
        <div className={cn('absolute inset-0 bg-gradient-to-br opacity-80', gradientMap[accent] || gradientMap.sky)} />
        <CardContent className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
              <h3 className="text-2xl font-semibold text-slate-950 dark:text-white sm:text-3xl">{value}</h3>
              {hint ? <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p> : null}
            </div>
            {Icon ? (
              <div className="rounded-2xl border border-white/50 bg-white/80 p-3 text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-950/70 dark:text-white">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function SectionCard({ title, description, action, children, className }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function StatusPill({ status, label }) {
  return <Badge variant={resolveStatusVariant(status)}>{label}</Badge>;
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center dark:border-white/10 dark:bg-slate-950/40">
      <p className="text-base font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
