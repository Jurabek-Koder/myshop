import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { parseServerDateTime, UZ_TIMEZONE } from '../../utils/uzbekistanTime.js';
import './AccountingPackerPage.css';

function formatNumUz(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('uz-UZ').format(x);
}

function splitDisplayAt(value) {
  const d = parseServerDateTime(value);
  if (!d) return { weekday: '—', dateStr: '—', timeStr: '—' };
  const weekday = d.toLocaleDateString('uz-UZ', { timeZone: UZ_TIMEZONE, weekday: 'long' });
  const dateStr = d.toLocaleDateString('uz-UZ', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeStr = d.toLocaleTimeString('uz-UZ', {
    timeZone: UZ_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { weekday, dateStr, timeStr };
}

const REPORT_PERIOD_DAYS = 30;

/**
 * Buxgalteriya: packer yoki boshqa sklad roli — Packer sahifasi bilan bir xil jadval/karusel.
 * @param {{ kind: 'packer' | 'picker' | 'courier' | 'operator' | 'seller'; title: string }} props
 */
export default function AccountingWorkRoleFinancePage({ kind, title }) {
  const { request } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [report, setReport] = useState(null);
  const [rewardCarouselIdx, setRewardCarouselIdx] = useState(0);

  const selectId = `accounting-wr-select-${kind}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const path =
        kind === 'packer'
          ? '/accounting/portal/packers'
          : `/accounting/portal/work-roles/list?kind=${encodeURIComponent(kind)}`;
      const res = await request(path);
      const d = res.ok ? await res.json() : {};
      if (!res.ok) {
        setError(d.error || 'Yuklashda xato');
        setRows([]);
        return;
      }
      const list =
        kind === 'packer'
          ? Array.isArray(d.packers)
            ? d.packers
            : []
          : Array.isArray(d.workers)
            ? d.workers
            : [];
      setRows(list);
      setSelectedId((prev) => {
        if (prev && list.some((p) => String(p.list_key) === String(prev))) return prev;
        return list.length ? String(list[0].list_key) : '';
      });
    } catch (e) {
      setError(e?.message || 'Tarmoq xatosi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [request, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((p) => String(p.list_key) === String(selectedId)) || null,
    [rows, selectedId],
  );

  const loadReportForWorkRole = useCallback(
    async (workRoleId) => {
      setReportLoading(true);
      setReportError('');
      setReport(null);
      try {
        if (workRoleId == null || !Number.isFinite(Number(workRoleId))) {
          setReportError('Ish roli ID topilmadi');
          return;
        }
        const url =
          kind === 'packer'
            ? `/accounting/portal/packers/report?work_role_id=${encodeURIComponent(String(workRoleId))}&days=${REPORT_PERIOD_DAYS}`
            : `/accounting/portal/work-roles/report?work_role_id=${encodeURIComponent(String(workRoleId))}&kind=${encodeURIComponent(kind)}&days=${REPORT_PERIOD_DAYS}`;
        const res = await request(url);
        const d = res.ok ? await res.json() : {};
        if (!res.ok) {
          setReportError(d.error || 'Hisobot yuklanmadi');
          return;
        }
        setReport(d);
      } catch (e) {
        setReportError(e?.message || 'Tarmoq xatosi');
      } finally {
        setReportLoading(false);
      }
    },
    [request, kind],
  );

  useEffect(() => {
    setRewardCarouselIdx(0);
    const row = rows.find((p) => String(p.list_key) === String(selectedId));
    const wid = row?.work_role_id;
    if (wid == null || !Number.isFinite(Number(wid))) {
      setReport(null);
      return;
    }
    void loadReportForWorkRole(wid);
  }, [selectedId, rows, loadReportForWorkRole]);

  const summary = report?.summary;
  const timeline = Array.isArray(report?.timeline) ? report.timeline : [];
  const balances = report?.balances;

  const receivedRewards = useMemo(() => {
    return timeline
      .filter((t) => t.source === 'ledger' && String(t.kind || '').toLowerCase() === 'reward')
      .sort((a, b) => String(a.display_at || '').localeCompare(String(b.display_at || '')));
  }, [timeline]);

  useEffect(() => {
    if (!receivedRewards.length) {
      setRewardCarouselIdx(0);
      return;
    }
    setRewardCarouselIdx(receivedRewards.length - 1);
  }, [receivedRewards]);

  const currentReward = receivedRewards[rewardCarouselIdx] || null;
  const rewardTime = currentReward ? splitDisplayAt(currentReward.display_at) : null;

  const rewardIdxRef = useRef(0);

  useEffect(() => {
    rewardIdxRef.current = rewardCarouselIdx;
  }, [rewardCarouselIdx]);

  const goRewardOlder = useCallback(() => {
    setRewardCarouselIdx((i) => Math.max(0, i - 1));
  }, []);

  const goRewardNewer = useCallback(() => {
    setRewardCarouselIdx((i) => Math.min(receivedRewards.length - 1, i + 1));
  }, [receivedRewards.length]);

  const onCarouselKeyDown = useCallback(
    (e) => {
      if (!receivedRewards.length) return;
      const max = receivedRewards.length - 1;
      if (e.key === 'ArrowLeft') {
        if (rewardIdxRef.current <= 0) return;
        e.preventDefault();
        goRewardOlder();
      } else if (e.key === 'ArrowRight') {
        if (rewardIdxRef.current >= max) return;
        e.preventDefault();
        goRewardNewer();
      }
    },
    [receivedRewards.length, goRewardOlder, goRewardNewer],
  );

  const selectLocked = loading && rows.length === 0;

  const displayId =
    selected?.staff_member_id != null && Number(selected.staff_member_id) > 0
      ? String(selected.staff_member_id)
      : selected?.work_role_id != null
        ? String(selected.work_role_id)
        : '—';

  const sectionHeading = kind === 'packer' ? 'Tanlangan packer' : `Tanlangan ${title}`;

  return (
    <div className="accounting-surface-page accounting-packer-page">
      <div className="accounting-surface-card">
        <div className="accounting-surface-card-accent" aria-hidden />
        <div className="accounting-surface-card-inner">
          <h1 className="accounting-title">{title}</h1>

          <section className="accounting-unified-toolbar" aria-label={`${title} tanlash`}>
            <label className="accounting-unified-field-label" htmlFor={selectId}>
              {title}
            </label>
            <select
              id={selectId}
              className="accounting-unified-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={selectLocked}
              aria-busy={loading}
            >
              {rows.length === 0 ? (
                <option value="">{loading ? 'Yuklanmoqda…' : `${title} yo‘q`}</option>
              ) : null}
              {rows.map((p) => (
                <option key={p.list_key} value={String(p.list_key)}>
                  {p.full_name || `WR ${p.work_role_id}`}
                  {p.work_role_login ? ` · sklad: ${p.work_role_login}` : ''}
                  {p.phone ? ` · ${p.phone}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline btn-sm accounting-unified-refresh"
              onClick={() => void load()}
            >
              Yangilash
            </button>
          </section>

          {error ? <p className="accounting-unified-error">{error}</p> : null}
          {loading ? <p className="accounting-unified-muted">Yuklanmoqda…</p> : null}

          {selected ? (
            <div className="accounting-unified-table-wrap">
              <h2 className="accounting-unified-section-title">{sectionHeading}</h2>
              <p className="accounting-unified-section-lead">
                Oxirgi <strong>{REPORT_PERIOD_DAYS} kun</strong> (taxminan <strong>1 oy</strong>) bo‘yicha ma’lumot.
                Jadval yoniga surib ko‘ring.
              </p>

              {reportError ? <p className="accounting-unified-error">{reportError}</p> : null}

              <div className="accounting-packer-summary-card">
                <div className="accounting-packer-summary-card-accent" aria-hidden />
                <div className="accounting-packer-summary-scroll">
                  <table className="accounting-packer-summary-table">
                    <thead>
                      <tr className="accounting-packer-summary-head-row">
                        <th scope="col">ID</th>
                        <th scope="col">Nomi</th>
                        <th scope="col">Umumiy balansi</th>
                        <th scope="col">Qolgan balansi</th>
                        <th scope="col">Mukofoti (1 oy)</th>
                        <th scope="col">Jarima (1 oy)</th>
                        <th scope="col">1 oy — olingan pullar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportLoading ? (
                        <tr className="accounting-packer-summary-body-row accounting-packer-summary-body-row--skel">
                          <td>
                            <span className="accounting-packer-skel accounting-packer-skel--id" aria-hidden />
                          </td>
                          <td>
                            <span className="accounting-packer-skel accounting-packer-skel--name" aria-hidden />
                          </td>
                          <td className="accounting-packer-num">
                            <span className="accounting-packer-skel accounting-packer-skel--pill" aria-hidden />
                          </td>
                          <td className="accounting-packer-num">
                            <span className="accounting-packer-skel accounting-packer-skel--pill" aria-hidden />
                          </td>
                          <td className="accounting-packer-num">
                            <span className="accounting-packer-skel accounting-packer-skel--pill" aria-hidden />
                          </td>
                          <td className="accounting-packer-num">
                            <span className="accounting-packer-skel accounting-packer-skel--pill" aria-hidden />
                          </td>
                          <td className="accounting-packer-carousel-cell">
                            <div className="accounting-packer-carousel accounting-packer-carousel--skel" aria-hidden>
                              <span className="accounting-packer-skel accounting-packer-skel--nav" />
                              <span className="accounting-packer-skel accounting-packer-skel--carousel" />
                              <span className="accounting-packer-skel accounting-packer-skel--nav" />
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr className="accounting-packer-summary-body-row">
                          <td>
                            <span className="accounting-packer-id-badge">{displayId}</span>
                          </td>
                          <td>
                            <span className="accounting-packer-name-cell">
                              {selected.full_name || selected.work_role_login || '—'}
                            </span>
                          </td>
                          <td className="accounting-packer-num">
                            {balances ? (
                              <span className="accounting-packer-pill accounting-packer-pill--balance">
                                {formatNumUz(balances.total_amount)} so‘m
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            className="accounting-packer-num"
                            title="Kutilayotgan yechishlar chiqarilgach taxminiy qolgan"
                          >
                            {balances ? (
                              <span className="accounting-packer-pill accounting-packer-pill--remain">
                                {formatNumUz(balances.remaining_after_pending)} so‘m
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="accounting-packer-num">
                            {summary ? (
                              <span className="accounting-packer-pill accounting-packer-pill--reward">
                                {formatNumUz(summary.reward_total)} so‘m
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="accounting-packer-num">
                            {summary ? (
                              <span className="accounting-packer-pill accounting-packer-pill--fine">
                                {formatNumUz(summary.fine_total)} so‘m
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="accounting-packer-carousel-cell">
                            {!receivedRewards.length ? (
                              <span className="accounting-p-carousel-empty">Bu oyda mukofot yozuvi yo‘q</span>
                            ) : (
                              <div
                                className="accounting-packer-carousel"
                                role="group"
                                aria-label="Oylik mukofotlar"
                                tabIndex={0}
                                onKeyDown={onCarouselKeyDown}
                              >
                                <button
                                  type="button"
                                  className="accounting-packer-carousel-nav accounting-packer-carousel-nav--prev"
                                  disabled={rewardCarouselIdx <= 0}
                                  onClick={goRewardOlder}
                                  aria-label="Chap: yangidan eskiroqqa — avvalgi mukofot"
                                  title="Chap (←): orqaga — avvalgi mukofot"
                                >
                                  <span className="accounting-packer-carousel-chevron" aria-hidden>
                                    ◀
                                  </span>
                                </button>
                                <div className="accounting-packer-carousel-panel">
                                  <div className="accounting-packer-carousel-amount">
                                    <span className="accounting-p-carousel-currency">
                                      +{formatNumUz(currentReward?.signed_amount)} so‘m
                                    </span>
                                  </div>
                                  {rewardTime ? (
                                    <div className="accounting-packer-carousel-when">
                                      <span className="accounting-packer-carousel-day">{rewardTime.weekday}</span>
                                      <span className="accounting-packer-carousel-date">{rewardTime.dateStr}</span>
                                      <span className="accounting-packer-carousel-time">{rewardTime.timeStr}</span>
                                    </div>
                                  ) : null}
                                  {(currentReward?.title || currentReward?.note) && (
                                    <div className="accounting-packer-carousel-note accounting-packer-muted">
                                      {[currentReward.title, currentReward.note].filter(Boolean).join(' — ')}
                                    </div>
                                  )}
                                  <div className="accounting-packer-carousel-meta accounting-packer-muted">
                                    {rewardCarouselIdx + 1} / {receivedRewards.length}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="accounting-packer-carousel-nav accounting-packer-carousel-nav--next"
                                  disabled={rewardCarouselIdx >= receivedRewards.length - 1}
                                  onClick={goRewardNewer}
                                  aria-label="O'ng: eskidan yangiroqqa — keyingi mukofot"
                                  title="O'ng (→): oldinga — keyingi mukofot"
                                >
                                  <span className="accounting-packer-carousel-chevron" aria-hidden>
                                    ▶
                                  </span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
