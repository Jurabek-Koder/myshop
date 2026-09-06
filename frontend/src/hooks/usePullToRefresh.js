import { useEffect, useRef, useState } from 'react';

/**
 * Mobil ilovalardagi kabi "pastga tortib yangilash" (pull-to-refresh).
 * Faqat TOUCH qurilmalarda ishlaydi (kompyuterda hech narsa qilmaydi —
 * u yerda brauzerning o'z Refresh tugmasi bor). Vertikal va gorizontal
 * (portrait/landscape) holatlarning ikkalasida ham bir xil ishlaydi,
 * chunki faqat sahifaning ICHKI vertikal skrolliga qaraydi, qurilma
 * yo'nalishiga emas.
 *
 * @param {() => Promise<void> | void} onRefresh
 * @param {React.RefObject<HTMLElement>} scrollElRef - skrol bo'ladigan konteyner
 */
export function usePullToRefresh(onRefresh, scrollElRef) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = scrollElRef?.current;
    if (!el) return undefined;
    if (!('ontouchstart' in window)) return undefined; // faqat touch qurilmalar

    const THRESHOLD = 68;
    const MAX_PULL = 110;

    function onTouchStart(e) {
      if (el.scrollTop > 0) {
        pullingRef.current = false;
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }

    function onTouchMove(e) {
      if (!pullingRef.current || startYRef.current == null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      if (el.scrollTop > 0) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }
      // Faqat yuqoridan pastga tortilganda sahifa o'zi scroll bo'lib
      // ketmasin — shu sabab default'ni to'xtatamiz.
      e.preventDefault();
      setPullDistance(Math.min(dy * 0.55, MAX_PULL));
    }

    async function onTouchEnd() {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const shouldRefresh = pullDistanceRef.current >= THRESHOLD;
      startYRef.current = null;
      if (shouldRefresh) {
        setRefreshing(true);
        setPullDistance(THRESHOLD);
        try {
          await onRefreshRef.current?.();
        } finally {
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollElRef]);

  return { pullDistance, refreshing };
}
