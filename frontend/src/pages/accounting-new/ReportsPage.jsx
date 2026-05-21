import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Download, Calendar, TrendingUp, TrendingDown,
  PieChart as PieChartIcon, BarChart2, DollarSign
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useAccountingApi } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, loading } = useAccountingApi(`/reports/monthly?month=${month}&year=${year}`);

  const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

  const incomeData = (data?.income?.by_category || []).filter(c => c.total > 0);
  const expenseData = (data?.expense?.by_category || []).filter(c => c.total > 0);

  const payrollData = data?.payroll || {};

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Moliyaviy hisobotlar</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Oylik moliyaviy tahlil va statistika</p>
        </div>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="input-field w-auto"
          >
            {monthNames.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="input-field w-auto"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-500">Umumiy daromad</span>
              </div>
              <p className="text-xl font-bold text-emerald-600">{formatMoney(data?.income?.total)} so'm</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500">Umumiy xarajat</span>
              </div>
              <p className="text-xl font-bold text-red-600">{formatMoney(data?.expense?.total)} so'm</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-primary-500" />
                <span className="text-xs text-gray-500">Sof foyda</span>
              </div>
              <p className={`text-xl font-bold ${(data?.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatMoney(data?.net_profit)} so'm
              </p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">Oylik to'lovlar</span>
              </div>
              <p className="text-xl font-bold text-purple-600">{formatMoney(payrollData.paid_total)} so'm</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income Pie */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-emerald-500" />
                Daromad taqsimoti
              </h3>
              {incomeData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={incomeData}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {incomeData.map((entry, i) => (
                          <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `${formatMoney(v)} so'm`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-gray-400">
                  Ma'lumot yo'q
                </div>
              )}
            </div>

            {/* Expense Pie */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-red-500" />
                Xarajat taqsimoti
              </h3>
              {expenseData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseData}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {expenseData.map((entry, i) => (
                          <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `${formatMoney(v)} so'm`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-gray-400">
                  Ma'lumot yo'q
                </div>
              )}
            </div>
          </div>

          {/* Payroll Summary */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary-500" />
              Oylik to'lovlar holati
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{payrollData.total_cycles || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Jami sikllar</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-center">
                <p className="text-2xl font-bold text-emerald-600">{payrollData.paid_count || 0}</p>
                <p className="text-xs text-emerald-600 mt-1">To'landi</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-center">
                <p className="text-2xl font-bold text-amber-600">{payrollData.pending_count || 0}</p>
                <p className="text-xs text-amber-600 mt-1">Kutilmoqda</p>
              </div>
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-center">
                <p className="text-2xl font-bold text-red-600">{payrollData.overdue_count || 0}</p>
                <p className="text-xs text-red-600 mt-1">Kechikkan</p>
              </div>
            </div>
          </div>

          {/* Category Breakdown Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Daromad kategoriyalari</h3>
              <div className="space-y-3">
                {(data?.income?.by_category || []).map((cat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || COLORS[i] }} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600">{formatMoney(cat.total)} so'm</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Xarajat kategoriyalari</h3>
              <div className="space-y-3">
                {(data?.expense?.by_category || []).map((cat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || COLORS[i] }} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-red-600">{formatMoney(cat.total)} so'm</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
