import { useEffect, useRef } from 'react';
import { showIncomingChatSystemNotification } from '../utils/systemNotifications.js';

/**
 * Kiruvchi xabarlar uchun tizim bildirishnomasi.
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {Array} opts.messages
 * @param {(m: object) => boolean} opts.isOutgoing
 * @param {(m: object) => string} opts.getTitle
 * @param {(m: object) => string} opts.getBody
 * @param {(m: object) => string} opts.getTag
 * @param {() => boolean} opts.shouldSuppress
 */
export function useSystemNotifyIncomingMessages({
  enabled,
  messages,
  isOutgoing,
  getTitle,
  getBody,
  getTag,
  shouldSuppress,
}) {
  const seenIdsRef = useRef(new Set());
  const bootstrappedRef = useRef(false);
  const cbRef = useRef({ isOutgoing, getTitle, getBody, getTag, shouldSuppress });
  cbRef.current = { isOutgoing, getTitle, getBody, getTag, shouldSuppress };

  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(messages) ? messages : [];
    const { isOutgoing: outFn, getTitle: gt, getBody: gb, getTag: tg, shouldSuppress: sup } = cbRef.current;

    if (!bootstrappedRef.current) {
      const seed = new Set();
      for (const m of list) {
        if (!outFn(m) && m?.id != null) seed.add(String(m.id));
      }
      seenIdsRef.current = seed;
      bootstrappedRef.current = true;
      return;
    }

    for (const m of list) {
      if (!m || outFn(m)) continue;
      const id = m.id != null ? String(m.id) : '';
      if (!id || seenIdsRef.current.has(id)) continue;
      seenIdsRef.current.add(id);
      try {
        if (sup?.()) continue;
      } catch {
        /* ignore */
      }
      showIncomingChatSystemNotification({
        title: gt(m),
        body: gb(m),
        tag: tg(m),
      });
    }
  }, [enabled, messages]);
}
