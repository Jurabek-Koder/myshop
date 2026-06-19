import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import '../../pages/picker/PickerDashboard.css';

export default function TargetMyChatView({ onOpenSidePanel }) {
  const { request, user } = useAuth();
  const { t: pickerUiT } = usePickerUiSettings();

  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [dmThreads, setDmThreads] = useState({});
  const skladPurgedRef = useRef(null);

  const pickerChatNick = useMemo(() => {
    const n = String(user?.full_name || '').trim();
    if (n) return n;
    return String(user?.login || user?.email || 'Target').trim() || 'Target';
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/target/chat/peers');
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        const apiPeers = (d.peers || []).map((p) => ({
          id: p.id,
          displayName: String(p.full_name || p.login || `#${p.id}`).trim(),
          roleLabel: String(p.role_label || 'Target').trim(),
          login: p.login || '',
          email: p.email || '',
          phone: String(p.phone || '').trim(),
        }));
        const myshop = {
          id: 'myshop',
          displayName: pickerUiT.chatTeam,
          roleLabel: pickerUiT.dmRoleSupport,
        };
        setDmPeers([myshop, ...apiPeers]);
      } catch {
        if (!cancelled) {
          setDmPeers([
            { id: 'myshop', displayName: pickerUiT.chatTeam, roleLabel: pickerUiT.dmRoleSupport },
          ]);
        }
      } finally {
        if (!cancelled) setDmPeersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, pickerUiT.chatTeam, pickerUiT.dmRoleSupport]);

  return (
    <main className="picker-main picker-main--telegram target-mychat-main">
      <PickerLichka
        t={pickerUiT}
        request={request}
        peers={dmPeers}
        peersLoading={dmPeersLoading}
        activePeer={dmActivePeer}
        setActivePeer={setDmActivePeer}
        threads={dmThreads}
        setThreads={setDmThreads}
        pickerChatNick={pickerChatNick}
        skladPurgedRef={skladPurgedRef}
        apiPrefix="/target"
        teamChatRoom="target"
        listTitleOverride="MyChat"
        listSubtitleOverride="Target foydalanuvchilari guruhi va shaxsiy yozishmalar"
        listRegionAriaOverride="Target MyChat"
        onOpenSidePanel={onOpenSidePanel}
        staffUserId={user?.id}
      />
    </main>
  );
}
