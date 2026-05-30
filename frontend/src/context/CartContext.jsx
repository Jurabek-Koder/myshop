import React, { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const s = localStorage.getItem('cart');
      return s ? JSON.parse(s) : [];
    } catch (_) {
      return [];
    }
  });

  const save = useCallback((newItems) => {
    setItems(newItems);
    localStorage.setItem('cart', JSON.stringify(newItems));
  }, []);

  const add = useCallback((product, quantity = 1) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.product_id === product.id);
      let next;
      if (i >= 0) {
        next = [...prev];
        next[i].quantity = Math.min((next[i].quantity || 0) + quantity, product.stock ?? 999);
      } else {
        next = [...prev, { product_id: product.id, product, quantity }];
      }
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  }, []);

  const remove = useCallback((productId) => {
    setItems((prev) => {
      const next = prev.filter((x) => x.product_id !== productId);
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  }, []);

  const setQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) return remove(productId);
    setItems((prev) => {
      const next = prev.map((x) =>
        x.product_id === productId ? { ...x, quantity: Math.max(1, quantity) } : x
      );
      localStorage.setItem('cart', JSON.stringify(next));
      return next;
    });
  }, [remove]);

  const totalItems = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalSum = items.reduce((s, i) => {
    const price = i.product?.sale_price ?? i.product?.price ?? 0;
    return s + price * (i.quantity || 0);
  }, 0);

  const clearCart = useCallback(() => save([]), [save]);

  return (
    <CartContext.Provider value={{ items, add, remove, setQuantity, clearCart, totalItems, totalSum }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart CartProvider ichida ishlatilishi kerak');
  return ctx;
}
