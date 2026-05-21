import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Calendar, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, CreditCard, Banknote, X, Search, Filter
} from 'lucide-react';
import { useAccountingApi, useAccountingMutation } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge-paid"><CheckCircle2 className="w-3 h-3 mr-1" />To'landi</span>;
  if (status === 'overdue') return <span className="badge-overdue"><AlertTriangle className="w-3 h-3 mr-1" />Kechikkan</span>;
  return <span className="badge-pending"><Clock className="w-3 h-3 mr-1" />Kutilmoqda</span>;
}

function PayModal({ cycle, onClose, onPaid }) {
  const { mutate, loading } = useAccountingMutation();
  const [method, setMethod] = useState('cash');

  const handlePay = async () => {
    try {
      await mutate('/payroll/pay', 'POST', {
        cycle_id: cycle.id,
        payment_method: method,
      });
      onPaid();
    } catch (e) { /* error handled by hook */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">To'lov amalga oshirish</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Xodim:</span>
              <span className="font-medium text-gray-900 dark:text-white">{cycle.employee_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Turi:</span>
              <span className="font-medium">{cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik ish haqi'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Summa:</span>
              <span className="font-bold text-primary-600">{formatMoney(cycle.amount)} so'm</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Muddat:</span>
              <span className="font-medium">{cycle.due_date}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To'lov usuli</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'cash', label: 'Naqd', icon: Banknote },
                { value: 'card', label: 'Karta', icon: CreditCard },
                { value: 'transfer', label: "O'tkazma", icon: Wallet },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMethod(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    method === opt.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                >
                  <opt.icon className={`w-5 h-5 ${method === opt.value ? 'text-primary-600' : 'text-gray-500'}`} />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handlePay}
            disabled={loading}
            className="btn-success w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>To'lovni tasdiqlash</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const queryParams = `?month=${month}&year=${year}${statusFilter ? `&status=${statusFilter}` : ''}`;
  const { data, loading, refetch } = useAccountingApi(`/payroll/cycles${queryParams}`);
  const { mutate, loading: genLoading } = useAccountingMutation();

  const generateCycles = async () => {
    try {
      await mutate('/payroll/generate-cycles', 'POST', { month, year });
      refetch();
    } catch (e) { /* handled */ }
  };

  const checkOverdue = async () => {
    try {
      await mutate('/payroll/check-overdue', 'POST');
      refetch();
    } catch (e) { /* handled */ }
  };

  const cycles = (data?.cycles || []).filter(c =>
    !searchTerm || c.employee_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paidCount = cycles.filter(c => c.status === 'paid').length;
  const pendingCount = cycles.filter(c => c.status === 'pending').length;
  const overdueCount = cycles.filter(c => c.status === 'overdue').length;
  const totalAmount = cycles.reduce((s, c) => s + (c.amount || 0), 0);
  const paidAmount = cycles.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);

  const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ish haqi boshqaruvi</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">15 kunlik sikl bo'yicha oylik hisob-kitob</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={checkOverdue} className="btn-secondary text-xs">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Kechikkanlarni tekshirish
          </button>
          <button onClick={generateCycles} disabled={genLoading} className="btn-primary text-xs">
            {genLoading ? '...' : '+ Sikllar yaratish'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Jami summa</p>
          <p className="text-lg font-bold mt-1">{formatMoney(totalAmount)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">To'langan</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">{formatMoney(paidAmount)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">To'landi</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">{paidCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Kutilmoqda</p>
          <p className="text-lg font-bold text-amber-500 mt-1">{pendingCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Kechikkan</p>
          <p className="text-lg font-bold text-red-500 mt-1">{overdueCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Xodim nomi bo'yicha qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
            />
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="">Barchasi</option>
              <option value="paid">To'landi</option>
              <option value="pending">Kutilmoqda</option>
              <option value="overdue">Kechikkan</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cycles Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cycles.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {monthNames[month - 1]} {year} uchun sikllar topilmadi
            </p>
            <button onClick={generateCycles} className="btn-primary mt-4 text-sm">
              Sikllar yaratish
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Xodim</th>
                    <th>Lavozim</th>
                    <th>Turi</th>
                    <th>Summa</th>
                    <th>Muddat</th>
                    <th>Holat</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => (
                    <tr key={cycle.id}>
                      <td className="font-medium text-gray-900 dark:text-white">{cycle.employee_name}</td>
                      <td className="text-gray-500">{cycle.position || '-'}</td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          cycle.cycle_type === 'advance'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                            : 'bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
                        }`}>
                          {cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik'}
                        </span>
                      </td>
                      <td className="font-semibold">{formatMoney(cycle.amount)} so'm</td>
                      <td className="text-gray-500">{cycle.due_date}</td>
                      <td><StatusBadge status={cycle.status} /></td>
                      <td>
                        {cycle.status !== 'paid' && (
                          <button
                            onClick={() => setSelectedCycle(cycle)}
                            className="btn-success text-xs py-1.5 px-3"
                          >
                            To'lash
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 p-4">
              {cycles.map((cycle) => (
                <motion.div
                  key={cycle.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{cycle.employee_name}</p>
                      <p className="text-xs text-gray-500">{cycle.position || '-'}</p>
                    </div>
                    <StatusBadge status={cycle.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{cycle.cycle_type === 'advance' ? 'Avans' : 'Oylik'}</span>
                      <span>{cycle.due_date}</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white">{formatMoney(cycle.amount)}</span>
                  </div>
                  {cycle.status !== 'paid' && (
                    <button
                      onClick={() => setSelectedCycle(cycle)}
                      className="btn-success w-full text-xs"
                    >
                      To'lash
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pay Modal */}
      <AnimatePresence>
        {selectedCycle && (
          <PayModal
            cycle={selectedCycle}
            onClose={() => setSelectedCycle(null)}
            onPaid={() => { setSelectedCycle(null); refetch(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
