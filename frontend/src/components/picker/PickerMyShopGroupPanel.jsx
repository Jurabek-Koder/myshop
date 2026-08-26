import React, { useMemo } from 'react';
import { resolveStaffChatMediaUrl } from '../../utils/staffChatMedia.js';
import PickerChatAudio from './PickerChatAudio';

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;

function urlsFromMessageText(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const raw = text.match(URL_IN_TEXT_RE);
  if (!raw?.length) return [];
  const norm = raw.map((u) => u.replace(/[.,;:!?)>\]]+$/g, ''));
  return [...new Set(norm)];
}

/**
 * MyShop jamoasi ustiga bosilganda: 5 ta yonma-yon matn yorliq (tugma ko‘rinishsiz) + mazmun.
 */
export default function PickerMyShopGroupPanel({
  open,
  onClose,
  section,
  onSectionChange,
  brandLine,
  selfLine,
  selfRoleHint,
  peers,
  peersLoading,
  messages,
  t,
}) {
  const files = useMemo(() => (messages || []).filter((m) => m.type === 'file'), [messages]);
  const audios = useMemo(() => (messages || []).filter((m) => m.type === 'audio'), [messages]);
  const videos = useMemo(() => (messages || []).filter((m) => m.type === 'video'), [messages]);
  const linkRows = useMemo(() => {
    const seen = new Set();
    const rows = [];
    const reversed = [...(messages || [])].reverse();
    for (const m of reversed) {
      if (m.type && m.type !== 'text') continue;
      const urls = urlsFromMessageText(String(m.text || ''));
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        rows.push({
          key: `${m.id}:${url}`,
          url,
          senderNick: m.senderNick,
          time: m.time,
        });
      }
    }
    return rows.reverse();
  }, [messages]);

  if (!open) return null;

  const tabClass = (key) =>
    `picker-ms-tab-text${section === key ? ' picker-ms-tab-text--active' : ''}`;

  return (
    <>
      <div className="picker-ms-group-backdrop" onClick={onClose} aria-hidden />
      <div
        className="picker-ms-group-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-ms-group-heading"
      >
        <div className="picker-ms-group-head">
          <h2 id="picker-ms-group-heading" className="picker-ms-group-title">
            {t.groupPanelTitle}
          </h2>
          <button type="button" className="picker-ms-group-close" onClick={onClose} aria-label={t.modalClose}>
            ×
          </button>
        </div>

        <div className="picker-ms-tab-row" role="tablist" aria-label={t.groupTabsAria}>
          <span
            role="tab"
            aria-selected={section === 'members'}
            tabIndex={0}
            className={tabClass('members')}
            onClick={() => onSectionChange('members')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSectionChange('members');
              }
            }}
          >
            {t.groupTabMembers}
          </span>
          <span
            role="tab"
            aria-selected={section === 'files'}
            tabIndex={0}
            className={tabClass('files')}
            onClick={() => onSectionChange('files')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSectionChange('files');
              }
            }}
          >
            {t.groupTabFiles}
          </span>
          <span
            role="tab"
            aria-selected={section === 'audio'}
            tabIndex={0}
            className={tabClass('audio')}
            onClick={() => onSectionChange('audio')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSectionChange('audio');
              }
            }}
          >
            {t.groupTabAudio}
          </span>
          <span
            role="tab"
            aria-selected={section === 'video'}
            tabIndex={0}
            className={tabClass('video')}
            onClick={() => onSectionChange('video')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSectionChange('video');
              }
            }}
          >
            {t.groupTabVideo}
          </span>
          <span
            role="tab"
            aria-selected={section === 'links'}
            tabIndex={0}
            className={tabClass('links')}
            onClick={() => onSectionChange('links')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSectionChange('links');
              }
            }}
          >
            {t.groupTabLinks}
          </span>
        </div>

        <div className="picker-ms-group-body">
          {section === 'members' && (
            <div className="picker-ms-group-pane" role="tabpanel">
              {peersLoading ? <p className="picker-ms-group-hint">{t.loading}</p> : null}
              <ul className="picker-ms-member-list">
                <li className="picker-ms-member-row picker-ms-member-row--brand">
                  <span className="picker-ms-member-name">{brandLine}</span>
                  <span className="picker-ms-member-role">{t.groupBrandSubtitle}</span>
                </li>
                <li className="picker-ms-member-row picker-ms-member-row--self">
                  <span className="picker-ms-member-name">{selfLine}</span>
                  {selfRoleHint ? <span className="picker-ms-member-role">{selfRoleHint}</span> : null}
                </li>
                {peers.map((p) => (
                  <li key={String(p.id)} className="picker-ms-member-row">
                    <span className="picker-ms-member-name">{p.displayName}</span>
                    {p.roleLabel ? <span className="picker-ms-member-role">{p.roleLabel}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section === 'files' && (
            <div className="picker-ms-group-pane" role="tabpanel">
              {files.length === 0 ? (
                <p className="picker-ms-group-hint">{t.groupEmptyFiles}</p>
              ) : (
                <ul className="picker-ms-media-list">
                  {files.map((m) => (
                    <li key={m.id} className="picker-ms-media-row">
                      {m.mediaUrl && !String(m.mediaUrl).startsWith('blob:') ? (
                        <a
                          href={resolveStaffChatMediaUrl(m.mediaUrl)}
                          className="picker-ms-media-link"
                          download={m.fileName}
                        >
                          {m.fileName || t.chatSnippetFileFallback}
                        </a>
                      ) : (
                        <span className="picker-ms-media-fallback">{m.fileName || t.chatSnippetFileFallback}</span>
                      )}
                      <span className="picker-ms-media-meta">
                        {m.senderNick || '—'} · {m.time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'audio' && (
            <div className="picker-ms-group-pane" role="tabpanel">
              {audios.length === 0 ? (
                <p className="picker-ms-group-hint">{t.groupEmptyAudio}</p>
              ) : (
                <ul className="picker-ms-media-list">
                  {audios.map((m) => (
                    <li key={m.id} className="picker-ms-media-row">
                      {m.mediaUrl ? (
                        <PickerChatAudio
                          src={resolveStaffChatMediaUrl(m.mediaUrl)}
                          playAria={t.chatAudioPlayAria}
                          pauseAria={t.chatAudioPauseAria}
                        />
                      ) : (
                        <span className="picker-ms-media-fallback">{t.chatSnippetAudio}</span>
                      )}
                      <span className="picker-ms-media-meta">
                        {m.senderNick || '—'} · {m.time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'video' && (
            <div className="picker-ms-group-pane" role="tabpanel">
              {videos.length === 0 ? (
                <p className="picker-ms-group-hint">{t.groupEmptyVideo}</p>
              ) : (
                <ul className="picker-ms-media-list">
                  {videos.map((m) => (
                    <li key={m.id} className="picker-ms-media-row picker-ms-media-row--video">
                      {m.mediaUrl ? (
                        <video
                          controls
                          src={resolveStaffChatMediaUrl(m.mediaUrl)}
                          className="picker-ms-media-video"
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <span className="picker-ms-media-fallback">
                          {m.videoNote ? t.chatSnippetVideoNote : t.chatSnippetVideo}
                        </span>
                      )}
                      <span className="picker-ms-media-meta">
                        {m.senderNick || '—'} · {m.time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'links' && (
            <div className="picker-ms-group-pane" role="tabpanel">
              {linkRows.length === 0 ? (
                <p className="picker-ms-group-hint">{t.groupEmptyLinks}</p>
              ) : (
                <ul className="picker-ms-media-list">
                  {linkRows.map((row) => (
                    <li key={row.key} className="picker-ms-media-row">
                      <a
                        href={row.url}
                        className="picker-ms-media-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {row.url}
                      </a>
                      <span className="picker-ms-media-meta">
                        {row.senderNick || '—'} · {row.time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
