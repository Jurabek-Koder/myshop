import React from 'react';
import { motion } from 'framer-motion';

export default function KpiCard({ title, value, hint, accent = 'brand', delay = 0 }) {
  return (
    <motion.div
      className={`ap-kpi ap-kpi--${accent}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <p className="ap-kpi-label">{title}</p>
      <p className="ap-kpi-value">{value}</p>
      {hint ? <p className="ap-kpi-hint">{hint}</p> : null}
    </motion.div>
  );
}
