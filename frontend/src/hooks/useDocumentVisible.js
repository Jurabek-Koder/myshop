import { useEffect, useState } from 'react';

/** Tab yashirin bo‘lsa false — chat poll va fon yangilanishlarini to‘xtatish uchun. */
export function useDocumentVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  );

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}
