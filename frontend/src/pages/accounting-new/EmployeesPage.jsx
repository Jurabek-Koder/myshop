import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, X, Phone, Briefcase, CreditCard,
  Calendar, Edit2, Eye, Search, UserCheck, UserX
} from 'lucide-react';
import { useAccountingApi, useAccountingMutation } from './useAccountingApi';

function formatMoney(amount) {
  if (!amount && amount !== 0) return '0';
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount));
}

function EmployeeModal({ employee, onClose, onSaved }) {
  const { mutate, loading, error } = useAccountingMutation();
  const [form, setForm] = useState({
    full_name: employee?.full_name || '',
    phone: employee?.phone || '',
    position: employee?.position || '',
    monthly_salary: employee?.monthly_salary || '',
    hire_date: employee?.hire_date || new Date().toISOString().split('T')[0],
    card_number: employee?.card_number || '',
    notes: employee?.notes || '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (employee) {
        await mutate(`/employees/${employee.id}`, 'PATCH', form);
      } else {
        await mutate('/employees', 'POST', form);
      }
      onSaved();
    } catch (e) { /* handled */ }
  };

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

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
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {employee ? 'Xodimni tahrirlash' : 'Yangi xodim qo\'shish'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">To'liq ism *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              className="input-field"
              required
              placeholder="Ism familiya"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Telefon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className="input-field"
                placeholder="+998..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lavozim</label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setField('position', e.target.value)}
                className="input-field"
                placeholder="Kuryer, Operator..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Oylik maosh *</label>
              <input
                type="number"
                value={form.monthly_salary}
                onChange={(e) => setField('monthly_salary', e.target.value)}
                className="input-field"
                required
                placeholder="5000000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ishga kirgan sana</label>
              <input
                type="date"
                value={form.hire_date}
                onChange={(e) => setField('hire_date', e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Karta raqami</label>
            <input
              type="text"
              value={form.card_number}
              onChange={(e) => setField('card_number', e.target.value)}
              className="input-field"
              placeholder="8600 ..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Izohlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className="input-field resize-none"
              rows={2}
              placeholder="Qo'shimcha ma'lumot..."
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Bekor qilish</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? '...' : (employee ? 'Saqlash' : 'Qo\'shish')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function EmployeesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  const { data, loading, refetch } = useAccountingApi(`/employees?status=${statusFilter}`);

  const employees = (data?.employees || []).filter(emp =>
    !searchTerm || emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (emp) => {
    setEditEmployee(emp);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditEmployee(null);
    setShowModal(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20 lg:pb-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Xodimlar</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Barcha xodimlar va ularning oylik ma'lumotlari
          </p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Yangi xodim</span>
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Xodim qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'active'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <UserCheck className="w-4 h-4 inline mr-1" />Faol
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'inactive'
                  ? 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <UserX className="w-4 h-4 inline mr-1" />Nofaol
            </button>
          </div>
        </div>
      </div>

      {/* Employee Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <div className="glass-card text-center py-16">
          <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Xodimlar topilmadi</p>
          <button onClick={handleAdd} className="btn-primary mt-4 text-sm">
            Birinchi xodimni qo'shing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card-hover p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-sm">
                    {emp.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{emp.full_name}</h4>
                    <p className="text-xs text-gray-500">{emp.position || 'Lavozim ko\'rsatilmagan'}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(emp)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Oylik maosh</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatMoney(emp.monthly_salary)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Jami to'langan</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatMoney(emp.total_paid)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-gray-500">
                  {emp.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />{emp.phone}
                    </span>
                  )}
                </div>
                {emp.next_payment_status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    emp.next_payment_status === 'overdue'
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                  }`}>
                    {emp.next_payment_status === 'overdue' ? 'Kechikkan' : 'Kutilmoqda'}
                  </span>
                )}
              </div>

              {emp.last_payment_date && (
                <p className="text-xs text-gray-400">
                  Oxirgi to'lov: {emp.last_payment_date.split('T')[0]}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <EmployeeModal
            employee={editEmployee}
            onClose={() => setShowModal(false)}
            onSaved={() => { setShowModal(false); refetch(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
