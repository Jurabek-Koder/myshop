import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePickerUiSettings } from '../../context/PickerUiSettingsContext';
import PickerLichka from '../../components/picker/PickerLichka';
import PickerMyShopGroupPanel from '../../components/picker/PickerMyShopGroupPanel';
import AdminStaffGroupWizard from './AdminStaffGroupWizard.jsx';
import { formatSkladPresenceSubtitle } from '../../i18n/pickerFormat.js';
import '../picker/PickerDashboard.css';

/**
 * Superuser admin panelidagi MyShop ichki chat — operator/kuryer bilan bir xil UI (mobil + desktop).
 */
function useMatchMedia(query) {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return m;
}

export default function AdminStaffChat({ onExitChat }) {
  const { request, user } = useAuth();
  const { t: pickerUiT } = usePickerUiSettings();
  const [groupWizardOpen, setGroupWizardOpen] = useState(false);
  const isNarrowViewport = useMatchMedia('(max-width: 1024px)');
  const [dmPeers, setDmPeers] = useState([]);
  const [dmPeersLoading, setDmPeersLoading] = useState(false);
  const [dmThreads, setDmThreads] = useState({});
  const [dmActivePeer, setDmActivePeer] = useState(null);
  const [skladPresencePeers, setSkladPresencePeers] = useState([]);
  const teamChatPurgedRef = useRef(new Set());
  const [myShopGroupOpen, setMyShopGroupOpen] = useState(false);
  const [myShopGroupSection, setMyShopGroupSection] = useState('members');

  const pickerChatNick = useMemo(
    () => String(user?.full_name || user?.login || 'Admin').trim() || 'Admin',
    [user?.full_name, user?.login]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDmPeersLoading(true);
      try {
        const res = await request('/admin/sklad-peers');
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        const apiPeers = (d.peers || []).map((p) => ({
          id: p.id,
          displayName: String(p.full_name || p.login || `#${p.id}`).trim(),
          roleLabel: String(p.role_label || '').trim(),
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
            {
              id: 'myshop',
              displayName: pickerUiT.chatTeam,
              roleLabel: pickerUiT.dmRoleSupport,
            },
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

  const skladPresenceSubtitle = useMemo(
    () => formatSkladPresenceSubtitle(skladPresencePeers, pickerUiT),
    [skladPresencePeers, pickerUiT]
  );

  useEffect(() => {
    const watch = dmActivePeer?.id === 'myshop';
    if (!watch) {
      setSkladPresencePeers([]);
      return undefined;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await request('/admin/chat/presence?room=operators&staleSec=14');
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSkladPresencePeers(Array.isArray(data.peers) ? data.peers : []);
      } catch {
        /* tarmoq */
      }
    };
    pull();
    const id = setInterval(pull, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [dmActivePeer?.id, request]);

  const sendOperatorsPresence = useCallback(
    async (state) => {
      try {
        await request('/admin/chat/presence', {
          method: 'POST',
          body: JSON.stringify({ state, chatRoom: 'operators' }),
        });
      } catch {
        /* tarmoq */
      }
    },
    [request]
  );

  const onSkladThreadPurge = useCallback((key) => {
    teamChatPurgedRef.current.add(key);
  }, []);

  const groupPeersList = useMemo(() => dmPeers.filter((p) => p.id !== 'myshop'), [dmPeers]);
  const myShopPanelMessages = useMemo(() => [...(dmThreads.myshop || [])], [dmThreads]);

  const railTopPlusAction = useMemo(
    () => ({
      onClick: () => setGroupWizardOpen(true),
      title: 'Yangi guruh',
      ariaLabel: 'Yangi guruh yaratish',
    }),
    [],
  );

  if (groupWizardOpen) {
    return (
      <main className="picker-main picker-main--telegram admin-staff-chat-main admin-staff-chat-main--wizard-only">
        <AdminStaffGroupWizard onClose={() => setGroupWizardOpen(false)} />
      </main>
    );
  }

  return (
    <main className="picker-main picker-main--telegram admin-staff-chat-main">
      {isNarrowViewport ? (
        <button
          type="button"
          className="admin-staff-chat-mobile-plus"
          onClick={() => setGroupWizardOpen(true)}
          title="Yangi guruh"
          aria-label="Yangi guruh yaratish"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
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
        skladPurgedRef={teamChatPurgedRef}
        onOpenMyShopGroup={() => setMyShopGroupOpen(true)}
        onSkladThreadPurge={onSkladThreadPurge}
        skladPresenceSubtitle={skladPresenceSubtitle}
        onSkladPresence={sendOperatorsPresence}
        apiPrefix="/admin"
        teamChatRoom="operators"
        listTitleOverride={pickerUiT.navMyShopChat}
        listSubtitleOverride={pickerUiT.myshopOperatorsGroupSubtitle}
        listRegionAriaOverride={pickerUiT.courierMyShopChatRegionAria}
        staffUserId={user?.id}
        onExitChat={onExitChat}
        railTopPlusAction={railTopPlusAction}
      />
      <PickerMyShopGroupPanel
        open={myShopGroupOpen}
        onClose={() => setMyShopGroupOpen(false)}
        section={myShopGroupSection}
        onSectionChange={setMyShopGroupSection}
        brandLine={pickerUiT.chatTeam}
        selfLine={`${pickerChatNick} (${pickerUiT.groupYouMark})`}
        selfRoleHint={String(user?.role || '').trim() || 'superuser'}
        peers={groupPeersList}
        peersLoading={dmPeersLoading}
        messages={myShopPanelMessages}
        t={pickerUiT}
      />
    </main>
  );
}
