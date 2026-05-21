import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';

export function useAccountingApi(endpoint, options = {}) {
  const { request } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await request(`/accounting/payroll${endpoint}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Xato yuz berdi' }));
        throw new Error(err.error || 'Xato yuz berdi');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [request, endpoint]);

  useEffect(() => {
    if (options.skip) return;
    fetchData();
  }, [fetchData, options.skip]);

  return { data, loading, error, refetch: fetchData };
}

export function useAccountingMutation() {
  const { request } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(async (endpoint, method = 'POST', body = null) => {
    try {
      setLoading(true);
      setError(null);
      const opts = { method };
      if (body) {
        opts.body = JSON.stringify(body);
      }
      const res = await request(`/accounting/payroll${endpoint}`, opts);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Xato yuz berdi');
      return json;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [request]);

  return { mutate, loading, error };
}
