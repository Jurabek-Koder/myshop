import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../picker/PickerLichka';
import '../../pages/picker/PickerDashboard.css';

export default function SellerMyShopChat({ onOpenSidePanel, onExitChat }) {
  const { request, user } = useAuth();
  const { t: pickerUiT } = usePickerUiSettings();

  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState('');
  const [serverThreads, setServerThreads] = useState([]);
  const [activePeer, setActivePeer] = useState(null);
  const [dmThreads, setDmThreads] = useState({});
  const skladPurgedRef = useRef(null);

  const pickerChatNick = useMemo(() => {
    const n = String(user?.full_name || '').trim();
    if (n) return n;
    return String(user?.login || user?.email || 'Seller').trim() || 'Seller';
  }, [user]);

  const loadThreads = useCallback(async () => {
    setThreadsError('');
    setThreadsLoading(true);
    try {
      const res = await request('/seller/chat/threads');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Yuklanmadi');
      const list = Array.isArray(data.threads) ? data.threads : [];
      setServerThreads(list);
    } catch (e) {
      setServerThreads([]);
      setThreadsError(String(e.message || e));
    } finally {
      setThreadsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const peers = useMemo(
    () =>
      serverThreads.map((row) => ({
        id: row.customerUserId,
        displayName: row.displayName,
        roleLabel: row.productSummary || pickerUiT.lichkaDirect,
        login: '',
        email: '',
        phone: String(row.phone || '').trim(),
      })),
    [serverThreads, pickerUiT.lichkaDirect]
  );

  useEffect(() => {
    if (!activePeer) return;
    const exists = peers.some((p) => Number(p.id) === Number(activePeer.id));
    if (!exists) setActivePeer(null);
  }, [peers, activePeer]);

  /** Kuryer `CourierDashboard` dagi `PickerLichka` bilan bir xil: `main.picker-main--telegram` ichida to‘liq balandlik. */
  return (
    <main className="picker-main picker-main--telegram seller-myshop-chat-main">
      {threadsLoading ? (
        <p className="picker-lichka-loading seller-myshop-chat-state">{pickerUiT.loading}…</p>
      ) : threadsError ? (
        <p className="seller-chat-thread-error seller-myshop-chat-state" role="alert">
          {threadsError}
        </p>
      ) : peers.length === 0 ? (
        <p className="picker-lichka-empty-thread seller-myshop-chat-state">
          Hozircha sizning mahsulotlaringiz bo‘yicha buyurtma bergan mijoz yo‘q — suhbatlar shu yerda paydo bo‘ladi.
        </p>
      ) : (
        <PickerLichka
          t={pickerUiT}
          request={request}
          peers={peers}
          peersLoading={false}
          activePeer={activePeer}
          setActivePeer={setActivePeer}
          threads={dmThreads}
          setThreads={setDmThreads}
          pickerChatNick={pickerChatNick}
          skladPurgedRef={skladPurgedRef}
          apiPrefix="/seller"
          teamChatRoom="operators"
          listTitleOverride={pickerUiT.navMyShopChat}
          listSubtitleOverride={pickerUiT.myshopOperatorsGroupSubtitle}
          listRegionAriaOverride={pickerUiT.courierMyShopChatRegionAria}
          onOpenSidePanel={onOpenSidePanel}
          onExitChat={onExitChat}
        />
      )}
    </main>
  );
}
