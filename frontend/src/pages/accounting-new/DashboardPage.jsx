import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  Clock, ArrowUpRight, ArrowDownRight, Plus, FileText, Wallet, Receipt
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useAccountingApi } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

function StatCard({ title, value, icon: Icon, trend, trendLabel, color, delay = 0 }) {
  const colors = {
    blue: 'from-blue-500/10 to-blue-600/5 text-blue-600 dark:text-blue-400',
    green: 'from-emerald-500/10 to-emerald-600/5 text-emerald-600 dark:text-emerald-400',
    red: 'from-red-500/10 to-red-600/5 text-red-600 dark:text-red-400',
    purple: 'from-purple-500/10 to-purple-600/5 text-purple-600 dark:text-purple-400',
    orange: 'from-orange-500/10 to-orange-600/5 text-orange-600 dark:text-orange-400',
  };

  const iconBg = {
    blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    green: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',
    purple: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
  };

  return (
    <motion.div variants={itemVariants} className="stat-card group">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {trendLabel && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{trendLabel}</span>
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl ${iconBg[color]} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

function QuickAction({ icon: Icon, label, onClick, color }) {
  const colors = {
    primary: 'hover:bg-primary-50 dark:hover:bg-primary-500/10 text-primary-600 dark:text-primary-400',
    success: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    purple: 'hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-600 dark:text-purple-400',
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 transition-all duration-200 ${colors[color]} hover:shadow-sm active:scale-95`}
    >
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">{label}</span>
    </button>
  );
}

export default function DashboardPage() {
  const { data: stats, loading: statsLoading } = useAccountingApi('/dashboard/stats');
  const { data: chartData, loading: chartLoading } = useAccountingApi('/dashboard/chart-data?months=6');
  const { data: activity, loading: activityLoading } = useAccountingApi('/dashboard/recent-activity?limit=10');

  const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Umumiy tushum"
          value={statsLoading ? '...' : `${formatMoney(stats?.total_income)} so'm`}
          icon={TrendingUp}
          color="green"
          trendLabel="Bu oy"
        />
        <StatCard
          title="Umumiy xarajatlar"
          value={statsLoading ? '...' : `${formatMoney(stats?.total_expense)} so'm`}
          icon={TrendingDown}
          color="red"
          trendLabel="Bu oy"
        />
        <StatCard
          title="Sof foyda"
          value={statsLoading ? '...' : `${formatMoney(stats?.net_profit)} so'm`}
          icon={DollarSign}
          color="blue"
          trend={stats?.net_profit >= 0 ? 1 : -1}
        />
        <StatCard
          title="Oyliklar jami"
          value={statsLoading ? '...' : `${formatMoney(stats?.total_payroll)} so'm`}
          icon={Users}
          color="purple"
          trendLabel={`${stats?.employee_count || 0} xodim`}
        />
      </div>

      {/* Alert Cards */}
      {stats && (stats.overdue_payrolls > 0 || stats.pending_payrolls > 0) && (
        <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
          {stats.overdue_payrolls > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                {stats.overdue_payrolls} ta kechikkan to'lov
              </span>
            </div>
          )}
          {stats.pending_payrolls > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {stats.pending_payrolls} ta kutilayotgan to'lov
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* Charts + Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Moliyaviy tahlil</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">Oxirgi 6 oy</span>
          </div>
          <div className="h-64">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData?.chart_data || []}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={(v) => [`${formatMoney(v)} so'm`]}
                  />
                  <Area type="monotone" dataKey="income" name="Daromad" stroke="#10b981" fill="url(#colorIncome)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" name="Xarajat" stroke="#ef4444" fill="url(#colorExpense)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Tezkor amallar</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction icon={Plus} label="Xarajat qo'shish" color="primary" onClick={() => window.location.hash = '#/accounting/transactions?action=expense'} />
            <QuickAction icon={Wallet} label="Oylik to'lash" color="success" onClick={() => window.location.hash = '#/accounting/payroll?action=pay'} />
            <QuickAction icon={Receipt} label="Avans berish" color="warning" onClick={() => window.location.hash = '#/accounting/payroll?action=advance'} />
            <QuickAction icon={FileText} label="Hisobot chiqarish" color="purple" onClick={() => window.location.hash = '#/accounting/reports'} />
          </div>
        </motion.div>
      </div>

      {/* Payroll Bar Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payroll Chart */}
        <motion.div variants={itemVariants} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Oylik xarajatlar</h3>
          <div className="h-52">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.chart_data || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={(v) => [`${formatMoney(v)} so'm`]}
                  />
                  <Bar dataKey="payroll" name="Oylik" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" name="Xarajat" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Oxirgi operatsiyalar</h3>
          <div className="space-y-3 max-h-52 overflow-y-auto">
            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (activity?.transactions?.length || activity?.payments?.length) ? (
              <>
                {(activity?.transactions || []).slice(0, 5).map((tx) => (
                  <div key={`tx-${tx.id}`} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        tx.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-red-100 dark:bg-red-500/20'
                      }`}>
                        {tx.type === 'income' ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[140px]">
                          {tx.description || tx.category_name || (tx.type === 'income' ? 'Daromad' : 'Xarajat')}
                        </p>
                        <p className="text-xs text-gray-500">{tx.date}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                    </span>
                  </div>
                ))}
                {(activity?.payments || []).slice(0, 3).map((p) => (
                  <div key={`pay-${p.id}`} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-500/20">
                        <Users className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[140px]">
                          {p.employee_name || 'Oylik to\'lov'}
                        </p>
                        <p className="text-xs text-gray-500">{p.payment_type === 'advance' ? 'Avans' : 'Oylik'}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-purple-600">-{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">Hozircha ma'lumot yo'q</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
