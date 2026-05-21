import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle
} from 'lucide-react';
import { useAccountingApi } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, loading } = useAccountingApi(`/payroll/cycles?month=${month}&year=${year}`);
  const cycles = data?.cycles || [];

  const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const dayNames = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Yak'];

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();
    const days = [];

    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);

    return days;
  }, [month, year]);

  const cyclesByDate = useMemo(() => {
    const map = {};
    for (const c of cycles) {
      const day = parseInt(c.due_date?.split('-')[2], 10);
      if (!map[day]) map[day] = [];
      map[day].push(c);
    }
    return map;
  }, [cycles]);

  const today = now.getDate();
  const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">To'lov kalendari</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Oylik va avans to'lov muddatlari</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="glass-card p-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {monthNames[month - 1]} {year}
          </h3>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;

              const dayCycles = cyclesByDate[day] || [];
              const hasPaid = dayCycles.some(c => c.status === 'paid');
              const hasPending = dayCycles.some(c => c.status === 'pending');
              const hasOverdue = dayCycles.some(c => c.status === 'overdue');
              const isToday = isCurrentMonth && day === today;
              const isPayDay = day === 15 || day === new Date(year, month, 0).getDate();

              return (
                <div
                  key={day}
                  className={`relative min-h-[80px] lg:min-h-[100px] p-1.5 rounded-xl border transition-colors ${
                    isToday
                      ? 'border-primary-300 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-500/5'
                      : isPayDay
                        ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50/30 dark:bg-amber-500/5'
                        : 'border-gray-100 dark:border-gray-700/30 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${
                      isToday ? 'text-primary-600 dark:text-primary-400 font-bold' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {day}
                    </span>
                    {isPayDay && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 font-medium">
                        {day === 15 ? 'Avans' : 'Oylik'}
                      </span>
                    )}
                  </div>

                  {dayCycles.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {dayCycles.slice(0, 3).map((c) => (
                        <div
                          key={c.id}
                          className={`text-[9px] px-1 py-0.5 rounded truncate ${
                            c.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                              : c.status === 'overdue'
                                ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                          }`}
                        >
                          {c.employee_name?.split(' ')[0]}
                        </div>
                      ))}
                      {dayCycles.length > 3 && (
                        <span className="text-[9px] text-gray-400">+{dayCycles.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Belgilar</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">To'langan</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-amber-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Kutilayotgan</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Kechikkan</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded border-2 border-amber-300 bg-amber-50" />
              <span className="text-sm text-gray-600 dark:text-gray-300">To'lov kuni (15 / oy oxiri)</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Bu oy xulosa</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Jami sikllar:</span>
              <span className="text-sm font-bold">{cycles.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">To'langan:</span>
              <span className="text-sm font-bold text-emerald-600">
                {cycles.filter(c => c.status === 'paid').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Kutilmoqda:</span>
              <span className="text-sm font-bold text-amber-600">
                {cycles.filter(c => c.status === 'pending').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-300">Kechikkan:</span>
              <span className="text-sm font-bold text-red-600">
                {cycles.filter(c => c.status === 'overdue').length}
              </span>
            </div>
            <hr className="border-gray-100 dark:border-gray-700" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Jami summa:</span>
              <span className="text-sm font-bold text-primary-600">
                {formatMoney(cycles.reduce((s, c) => s + (c.amount || 0), 0))} so'm
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
