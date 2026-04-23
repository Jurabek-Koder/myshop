import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// ✅ FAqat shu ishlaydi
const API = import.meta.env.VITE_API_URL;

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);

    let res;
    try {
      res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setLoading(false);
      throw new Error("Backendga ulanib bo‘lmadi");
    }

    const text = await res.text();
    const data = parseJSON(text);

    if (!res.ok) {
      setLoading(false);
      throw new Error(data?.message || "Login xato");
    }

    // ✅ tokenni har xil variantni qamrab olamiz
    const token = data?.access || data?.accessToken || data?.token;

    if (!token) {
      setLoading(false);
      throw new Error("Server token qaytarmadi");
    }

    if (!data?.user) {
      setLoading(false);
      throw new Error("User ma’lumot kelmadi");
    }

    // saqlash
    sessionStorage.setItem('token', token);

    setUser(data.user);
    setLoading(false);

    return data;
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
