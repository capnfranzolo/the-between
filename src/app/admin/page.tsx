'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { CurveType } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';

const Spirograph = dynamic(() => import('@/components/Spirograph'), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface Question { id: string; slug: string; text: string }

interface AdminStar {
  id: string;
  shortcode: string;
  answer: string;
  unique_fact: string | null;
  status: 'pending' | 'approved' | 'rejected';
  question_id: string;
  ip_hash: string;
  ip_count: number;
  connection_count: number;
  created_at: string;
  approved_at: string | null;
  dimensions: (DimensionResult & { curveType: CurveType; reasoning: string }) | null;
  questions?: { id: string; slug: string; text: string } | null;
}

interface AdminConnection {
  id: string;
  from_star_id: string;
  to_star_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  question_id: string;
  created_at: string;
  from_star: AdminStar | null;
  to_star: AdminStar | null;
}

interface Stats {
  totalStars: number;
  pendingStars: number;
  approvedStars: number;
  rejectedStars: number;
  totalConnections: number;
  pendingConnections: number;
  approvedConnections: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: '#332200', color: '#ffaa00', label: 'pending' },
  approved: { bg: '#002200', color: '#00cc44', label: 'approved' },
  rejected: { bg: '#220000', color: '#cc4444', label: 'rejected' },
};

// ─── Shared styles ───────────────────────────────────────────────────────────

const S = {
  page:    { background: '#0a0a0a', color: '#e0e0e0', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', fontSize: 13 },
  topbar:  { background: '#111', borderBottom: '1px solid #222', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky' as const, top: 0, zIndex: 100, flexWrap: 'wrap' as const },
  tab:     (active: boolean) => ({ padding: '6px 14px', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: 12, background: active ? '#333' : 'transparent', color: active ? '#fff' : '#888' }),
  btn:     (variant: 'primary' | 'ghost' | 'danger' = 'ghost') => ({
    padding: '5px 12px', border: `1px solid ${variant === 'danger' ? '#cc4444' : '#444'}`,
    borderRadius: 4, cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: 12,
    background: variant === 'primary' ? '#1a472a' : variant === 'danger' ? '#2a0000' : 'transparent',
    color: variant === 'danger' ? '#cc4444' : '#ccc',
  }),
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: '6px 8px', color: '#888' },
  input:   { background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#e0e0e0', padding: '6px 10px', fontFamily: 'system-ui, sans-serif', fontSize: 13, outline: 'none' },
  textarea:{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#e0e0e0', padding: '8px 10px', fontFamily: 'system-ui, sans-serif', fontSize: 13, outline: 'none', resize: 'vertical' as const, width: '100%', boxSizing: 'border-box' as const },
  row:     { borderBottom: '1px solid #1a1a1a', display: 'grid' as const, alignItems: 'center', padding: '6px 8px', gap: 8 },
  mono:    { fontFamily: 'monospace', fontSize: 12 },
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#222', color: '#aaa', label: status };
  return <span style={{ background: s.bg, color: s.color, padding: '2px 7px', borderRadius: 3, fontSize: 11, fontFamily: 'monospace' }}>{s.label}</span>;
}

// ─── DimTable ─────────────────────────────────────────────────────────────────

type DimsShape = (DimensionResult & { curveType: CurveType; reasoning: string }) | null;

function DimTable({ dims, before }: { dims: DimsShape; before?: DimsShape }) {
  if (!dims) return <span style={{ color: '#555' }}>no dimensions</span>;
  const keys = ['certainty', 'warmth', 'tension', 'vulnerability', 'scope', 'rootedness', 'emotionIndex', 'curveType'] as const;
  return (
    <table style={{ fontSize: 11, fontFamily: 'monospace', color: '#aaa', lineHeight: 1.6 }}>
      <tbody>
        {keys.map(k => {
          const val = dims[k as keyof typeof dims];
          const prev = before?.[k as keyof typeof before];
          const changed = before !== undefined && prev !== val;
          return (
            <tr key={k}>
              <td style={{ color: '#555', paddingRight: 12 }}>{k}</td>
              <td style={{ color: changed ? '#ffaa00' : '#ccc' }}>
                {typeof val === 'number' ? val.toFixed(3) : String(val)}
                {changed && prev !== undefined && (
                  <span style={{ color: '#555', marginLeft: 8 }}>
                    (was {typeof prev === 'number' ? prev.toFixed(3) : String(prev)})
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── StarDetailPanel ─────────────────────────────────────────────────────────

function StarDetailPanel({
  star, onClose, onSaved, onDeleted,
}: {
  star: AdminStar;
  onClose: () => void;
  onSaved: (updated: AdminStar) => void;
  onDeleted: (id: string) => void;
}) {
  const [answer, setAnswer] = useState(star.answer);
  const [byline, setByline] = useState(star.unique_fact ?? '');
  const [status, setStatus] = useState(star.status);
  const [saving, setSaving] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [regenDiff, setRegenDiff] = useState<{ before: DimsShape; after: DimsShape } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dims, setDims] = useState(star.dimensions);
  const answerChanged = answer !== star.answer;

  async function save() {
    setSaving(true);
    const body: Record<string, unknown> = { status };
    if (answerChanged) body.answer = answer;
    if (byline !== (star.unique_fact ?? '')) body.uniqueFact = byline;
    const res = await fetch(`/api/admin/stars/${star.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) { setDims(data.star.dimensions); onSaved(data.star); }
  }

  async function regen() {
    setRegenning(true);
    const res = await fetch(`/api/admin/stars/${star.id}/regen`, { method: 'POST' });
    const data = await res.json();
    setRegenning(false);
    if (data.ok) {
      setDims(data.after);
      setRegenDiff({ before: data.before, after: data.after });
      setTimeout(() => setRegenDiff(null), 5000);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/stars/${star.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        onDeleted(star.id);
      } else {
        setDeleteError(data.error ?? 'Delete failed');
        setDeleting(false);
        setConfirmDelete(false);
      }
    } catch {
      setDeleteError('Network error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '16px 20px', marginBottom: 2 }}>
      <style>{`@media(max-width:700px){.btw-detail-grid{grid-template-columns:1fr!important}}`}</style>
      <div className="btw-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>Answer</div>
            <textarea value={answer} onChange={e => setAnswer(e.target.value.slice(0, 500))} rows={4} style={S.textarea} />
            <div style={{ fontSize: 11, color: answer.length > 450 ? '#ffaa00' : '#555', textAlign: 'right' }}>
              {answer.length}/500{answerChanged && <span style={{ color: '#ffaa00', marginLeft: 8 }}>⚡ will regen dimensions</span>}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>Byline</div>
            <input value={byline} onChange={e => setByline(e.target.value.slice(0, 120))} style={{ ...S.input, width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ color: '#666', fontSize: 11 }}>Status</div>
            <select value={status} onChange={e => setStatus(e.target.value as AdminStar['status'])} style={S.input}>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <button onClick={save} disabled={saving} style={S.btn('primary')}>{saving ? 'Saving…' : 'Save changes'}</button>
            <button onClick={regen} disabled={regenning} style={S.btn()}>{regenning ? 'Regenerating…' : '🔄 Regen star'}</button>
            <a href={`/cosmos/${star.question_id}?star=${star.shortcode}`} target="_blank" rel="noreferrer" style={{ ...S.btn(), textDecoration: 'none', display: 'inline-block' }}>👁 Preview</a>
            {deleteError && <span style={{ color: '#ff6666', fontSize: 12 }}>⚠ {deleteError}</span>}
            {!confirmDelete
              ? <button onClick={() => { setDeleteError(null); setConfirmDelete(true); }} style={S.btn('danger')}>🗑 Delete</button>
              : <>
                  <span style={{ color: '#cc4444', fontSize: 12 }}>
                    Delete?{star.connection_count > 0 && ` (removes ${star.connection_count} connections)`}
                  </span>
                  <button onClick={doDelete} disabled={deleting} style={S.btn('danger')}>
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} disabled={deleting} style={S.btn()}>Cancel</button>
                </>}
          </div>
          <div>
            <div style={{ color: '#555', fontSize: 11, marginBottom: 4 }}>
              Dimensions {regenDiff && <span style={{ color: '#ffaa00' }}>— showing diff for 5s</span>}
            </div>
            {regenDiff ? <DimTable dims={regenDiff.after} before={regenDiff.before} /> : <DimTable dims={dims} />}
          </div>
          <div style={{ ...S.mono, color: '#555', fontSize: 11, lineHeight: 1.8 }}>
            <div>shortcode: <span style={{ color: '#aaa' }}>{star.shortcode}</span> · <a href={`/s/${star.shortcode}`} target="_blank" rel="noreferrer" style={{ color: '#6af' }}>/s/{star.shortcode}</a></div>
            <div>ip_hash: {star.ip_hash} · {star.ip_count} submission{star.ip_count !== 1 ? 's' : ''} from this IP</div>
            <div>created: {new Date(star.created_at).toLocaleString()}</div>
            {star.approved_at && <div>approved: {new Date(star.approved_at).toLocaleString()}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {dims && <Spirograph dimensions={dims} size={200} animate={true} />}
          <button onClick={onClose} style={{ ...S.btn(), fontSize: 11 }}>✕ close</button>
        </div>
      </div>
    </div>
  );
}

// ─── ConnectionDetailPanel ────────────────────────────────────────────────────

function ConnectionDetailPanel({
  conn, onClose, onSaved, onDeleted,
}: {
  conn: AdminConnection;
  onClose: () => void;
  onSaved: (updated: AdminConnection) => void;
  onDeleted: (id: string) => void;
}) {
  const [status, setStatus] = useState(conn.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/connections/${conn.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) onSaved(data.connection);
  }

  async function doDelete() {
    const res = await fetch(`/api/admin/connections/${conn.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) onDeleted(conn.id);
  }

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: '16px 20px', marginBottom: 2 }}>
      <style>{`@media(max-width:700px){.btw-conn-grid{grid-template-columns:1fr!important}}`}</style>
      <div className="btw-conn-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 16 }}>
        {([conn.from_star, conn.to_star] as const).map((star, i) => star && (
          <div key={i}>
            <div style={{ color: '#555', fontSize: 11, marginBottom: 4 }}>{i === 0 ? '↑ From (orbiter)' : '↓ To (anchor)'}</div>
            <div style={{ ...S.mono, color: '#6af', marginBottom: 4 }}>{star.shortcode}</div>
            <div style={{ color: '#ddd', fontSize: 13, marginBottom: 8 }}>{star.answer}</div>
            {star.unique_fact && <div style={{ color: '#888', fontSize: 12 }}>{star.unique_fact}</div>}
            {star.dimensions && (
              <div style={{ marginTop: 8 }}>
                <Spirograph dimensions={star.dimensions} size={160} animate={true} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 13, marginBottom: 12 }}>"{conn.reason}"</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={status} onChange={e => setStatus(e.target.value as AdminConnection['status'])} style={S.input}>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        <button onClick={save} disabled={saving} style={S.btn('primary')}>{saving ? 'Saving…' : 'Save'}</button>
        {!confirmDelete
          ? <button onClick={() => setConfirmDelete(true)} style={S.btn('danger')}>🗑 Delete</button>
          : <>
              <button onClick={doDelete} style={S.btn('danger')}>Confirm delete</button>
              <button onClick={() => setConfirmDelete(false)} style={S.btn()}>Cancel</button>
            </>}
        <button onClick={onClose} style={{ ...S.btn(), marginLeft: 'auto' }}>✕ close</button>
      </div>
    </div>
  );
}

// ─── ConnectModal ─────────────────────────────────────────────────────────────

function ConnectModal({
  from, to, onClose, onCreated,
}: {
  from: AdminStar;
  to: AdminStar;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    const res = await fetch('/api/admin/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromStarId: from.id, toStarId: to.id, reason }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      onCreated(data.hadExisting
        ? `Connected — note: ${from.shortcode} already had an active connection`
        : `${from.shortcode} now orbits ${to.shortcode}`);
      onClose();
    } else {
      setErr(data.error ?? 'Failed');
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#141414', border: '1px solid #333', borderRadius: 8,
        padding: 24, width: '100%', maxWidth: 480,
      }}>
        <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>CREATE CONNECTION</div>

        {/* Visual summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 5, padding: '8px 12px' }}>
            <span style={{ ...S.mono, color: '#6af', marginRight: 8 }}>{from.shortcode}</span>
            <span style={{ color: '#aaa', fontSize: 12 }}>{trunc(from.answer, 80)}</span>
          </div>
          <div style={{ textAlign: 'center', color: '#555', fontSize: 12, letterSpacing: '0.06em' }}>will orbit ↓</div>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 5, padding: '8px 12px' }}>
            <span style={{ ...S.mono, color: '#6af', marginRight: 8 }}>{to.shortcode}</span>
            <span style={{ color: '#aaa', fontSize: 12 }}>{trunc(to.answer, 80)}</span>
          </div>
        </div>

        <div style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>Reason <span style={{ color: '#444' }}>(optional)</span></div>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submit(); if (e.key === 'Escape') onClose(); }}
          rows={3}
          placeholder="Why does this thought orbit that one?"
          style={{ ...S.textarea, marginBottom: 12 }}
        />
        {err && <div style={{ color: '#ff6666', fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.btn()}>Cancel</button>
          <button onClick={submit} disabled={saving} style={S.btn('primary')}>
            {saving ? 'Connecting…' : 'Connect →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StarsTab ────────────────────────────────────────────────────────────────

function StarsTab({ questionFilter }: { questionFilter: string }) {
  const [stars, setStars] = useState<AdminStar[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('approved');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false); // guard against concurrent fetches

  // Drag-to-connect state
  const [draggedStar, setDraggedStar] = useState<AdminStar | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [connectModal, setConnectModal] = useState<{ from: AdminStar; to: AdminStar } | null>(null);
  const [connectToast, setConnectToast] = useState<string | null>(null);

  const load = useCallback(async (pg = 0, reset = false) => {
    // Prevent duplicate concurrent fetches
    if (loadingRef.current && !reset) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      status: statusFilter, page: String(pg), limit: '50',
      ...(search && { search }),
      ...(questionFilter && { questionId: questionFilter }),
    });
    try {
      const res = await fetch(`/api/admin/stars?${params}`);
      const data = await res.json();
      const rows: AdminStar[] = data.stars ?? [];
      setStars(prev => {
        if (reset) return rows;
        // Dedup by id — offset pagination can overlap when rows are deleted
        const seen = new Set(prev.map(s => s.id));
        return [...prev, ...rows.filter(r => !seen.has(r.id))];
      });
      setHasMore(rows.length === 50);
      setPage(pg);
    } catch {
      setError('Failed to load stars');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [statusFilter, search, questionFilter]);

  // Only re-run when filter/search/question changes — not on every render
  useEffect(() => {
    load(0, true);
    setSelected(new Set());
    setExpanded(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, questionFilter]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selected.size === 0) return;
      if (e.key === 'a') { e.preventDefault(); bulkAction('approve'); }
      if (e.key === 'r') { e.preventDefault(); bulkAction('reject'); }
      if (e.key === 'd') { e.preventDefault(); setBulkConfirm(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function quickAction(id: string, status: 'approved' | 'rejected') {
    setStars(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    const res = await fetch(`/api/admin/stars/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    if (!res.ok) load(page, true);
  }

  async function quickDelete(id: string) {
    // Snapshot before optimistic removal so we can roll back
    const snapshot = stars.find(s => s.id === id);
    setStars(prev => prev.filter(s => s.id !== id));
    const res = await fetch(`/api/admin/stars/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) {
      // Roll back and surface the error
      if (snapshot) setStars(prev => {
        // Insert it back at the same approximate position
        const copy = prev.filter(s => s.id !== id);
        copy.push(snapshot);
        return copy;
      });
      setError(data.error ?? 'Delete failed');
      setTimeout(() => setError(null), 5000);
    }
  }

  async function bulkAction(action: 'approve' | 'reject' | 'delete') {
    const ids = [...selected];
    const snapshot = stars.filter(s => selected.has(s.id));

    // Optimistic update
    if (action === 'approve') {
      setStars(prev => prev.map(s => selected.has(s.id) ? { ...s, status: 'approved' } : s));
    } else if (action === 'reject') {
      setStars(prev => prev.map(s => selected.has(s.id) ? { ...s, status: 'rejected' } : s));
    } else {
      setStars(prev => prev.filter(s => !selected.has(s.id)));
    }
    setSelected(new Set());
    setBulkConfirm(false);

    const res = await fetch('/api/admin/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, type: 'star', ids }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Roll back and reload authoritative state from server
      if (action === 'delete') {
        setStars(prev => {
          const existing = new Set(prev.map(s => s.id));
          return [...prev, ...snapshot.filter(s => !existing.has(s.id))];
        });
      } else {
        load(page, true);
      }
      setError(data.error ?? `Bulk ${action} failed`);
      setTimeout(() => setError(null), 5000);
    }
  }

  const allChecked = stars.length > 0 && stars.every(s => selected.has(s.id));

  function showToast(msg: string) {
    setConnectToast(msg);
    setTimeout(() => setConnectToast(null), 4000);
  }

  // Drag handlers — build the from→to pair, open modal on drop
  function onDragStart(e: React.DragEvent, star: AdminStar) {
    setDraggedStar(star);
    e.dataTransfer.effectAllowed = 'link';
    // Ghost label
    const ghost = document.createElement('div');
    ghost.textContent = star.shortcode;
    ghost.style.cssText = 'position:absolute;top:-999px;left:-999px;background:#1a472a;color:#ccc;padding:4px 10px;border-radius:4px;font-family:monospace;font-size:12px;pointer-events:none';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  function onDragOver(e: React.DragEvent, targetId: string) {
    if (!draggedStar || draggedStar.id === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    setDragOverId(targetId);
  }

  function onDrop(e: React.DragEvent, target: AdminStar) {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedStar || draggedStar.id === target.id) return;
    setConnectModal({ from: draggedStar, to: target });
    setDraggedStar(null);
  }

  return (
    <div>
      {connectModal && (
        <ConnectModal
          from={connectModal.from}
          to={connectModal.to}
          onClose={() => setConnectModal(null)}
          onCreated={showToast}
        />
      )}
      {connectToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: '#1a472a', color: '#aaffcc', padding: '10px 20px', borderRadius: 6, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
          ✓ {connectToast}
        </div>
      )}
      {error && (
        <div style={{ background: '#2a0000', color: '#ff6666', padding: '8px 16px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ⚠ {error}
          <button onClick={() => setError(null)} style={{ ...S.iconBtn, color: '#ff6666', fontSize: 16 }}>×</button>
        </div>
      )}

      <div className="btw-admin-filters" style={{ display: 'flex', gap: 8, padding: '10px 12px', background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={S.tab(statusFilter === s)}>{s}</button>
        ))}
        <span style={{ color: '#444', fontSize: 11, marginLeft: 8 }}>drag a row onto another to connect</span>
        <input className="btw-admin-search" placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} style={{ ...S.input, marginLeft: 'auto', width: 200 }} />
      </div>

      {selected.size > 0 && (
        <div style={{ background: '#1a1400', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#ffaa00', fontSize: 12 }}>{selected.size} selected · a=approve r=reject d=delete</span>
          {!bulkConfirm ? (
            <>
              <button onClick={() => bulkAction('approve')} style={S.btn('primary')}>Approve selected</button>
              <button onClick={() => bulkAction('reject')} style={S.btn()}>Reject selected</button>
              <button onClick={() => setBulkConfirm(true)} style={S.btn('danger')}>Delete selected</button>
              <button onClick={() => setSelected(new Set())} style={S.btn()}>Deselect</button>
            </>
          ) : (
            <>
              <span style={{ color: '#cc4444', fontSize: 12 }}>Delete {selected.size} stars and their connections?</span>
              <button onClick={() => bulkAction('delete')} style={S.btn('danger')}>Confirm delete</button>
              <button onClick={() => setBulkConfirm(false)} style={S.btn()}>Cancel</button>
            </>
          )}
        </div>
      )}

      <div className="btw-admin-desktop" style={{ ...S.row, gridTemplateColumns: '24px 72px 80px 1fr 180px 64px 40px 70px 110px', background: '#0d0d0d', color: '#555', fontSize: 11, borderBottom: '1px solid #222' }}>
        <input type="checkbox" checked={allChecked} onChange={e => setSelected(e.target.checked ? new Set(stars.map(s => s.id)) : new Set())} />
        <span>status</span><span>code</span><span>answer</span><span>byline</span><span>question</span><span>ips</span><span>age</span><span>actions</span>
      </div>

      {loading && <div style={{ padding: 24, color: '#555', textAlign: 'center' }}>Loading…</div>}

      {stars.map(star => {
        const isDropTarget = dragOverId === star.id && draggedStar?.id !== star.id;
        const isDragging = draggedStar?.id === star.id;
        const dropStyle: React.CSSProperties = isDropTarget
          ? { outline: '2px solid #4a9', outlineOffset: -2, background: '#0d2a1a' }
          : {};
        return (
        <div key={star.id} style={{ borderBottom: '1px solid #1a1a1a', opacity: isDragging ? 0.45 : 1, transition: 'opacity .15s' }}>
          {/* Desktop row */}
          <div
            className="btw-admin-desktop"
            draggable
            onDragStart={e => onDragStart(e, star)}
            onDragEnd={() => { setDraggedStar(null); setDragOverId(null); }}
            onDragOver={e => onDragOver(e, star.id)}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => onDrop(e, star)}
            style={{ ...S.row, ...dropStyle, gridTemplateColumns: '24px 72px 80px 1fr 180px 64px 40px 70px 110px', borderBottom: 'none', cursor: 'grab', background: expanded === star.id ? '#181818' : 'transparent' }}
            onClick={() => setExpanded(e => e === star.id ? null : star.id)}
          >
            <input
              type="checkbox"
              checked={selected.has(star.id)}
              onClick={e => e.stopPropagation()}
              onChange={e => { const s = new Set(selected); e.target.checked ? s.add(star.id) : s.delete(star.id); setSelected(s); }}
            />
            <StatusBadge status={star.status} />
            <a
              href={`/cosmos/${star.question_id}?star=${star.shortcode}`}
              target="_blank" rel="noreferrer"
              style={{ ...S.mono, color: '#6af', textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}
            >{star.shortcode}</a>
            <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={star.answer}>{trunc(star.answer, 80)}</span>
            <span style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={star.unique_fact ?? ''}>{trunc(star.unique_fact ?? '—', 40)}</span>
            <span style={{ ...S.mono, color: '#666', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(star.questions as Question | null | undefined)?.slug ?? star.question_id.slice(0, 8)}
            </span>
            <span style={{ ...S.mono, color: star.ip_count > 5 ? '#cc4444' : '#666' }}>{star.ip_count}</span>
            <span style={{ color: '#555' }}>{relTime(star.created_at)}</span>
            <span style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              <button title="approve" onClick={() => quickAction(star.id, 'approved')} style={S.iconBtn}>✓</button>
              <button title="reject" onClick={() => quickAction(star.id, 'rejected')} style={S.iconBtn}>✗</button>
              <button title="expand" onClick={() => setExpanded(e => e === star.id ? null : star.id)} style={S.iconBtn}>✎</button>
              <a title="preview" href={`/cosmos/${star.question_id}?star=${star.shortcode}`} target="_blank" rel="noreferrer" style={{ ...S.iconBtn, textDecoration: 'none' }}>👁</a>
              <button title="delete" onClick={() => quickDelete(star.id)} style={{ ...S.iconBtn, color: '#844' }}>🗑</button>
            </span>
          </div>
          {/* Mobile card */}
          <div
            className="btw-admin-card"
            style={{ padding: '10px 12px', cursor: 'pointer', background: expanded === star.id ? '#181818' : 'transparent', ...dropStyle }}
            onClick={() => setExpanded(e => e === star.id ? null : star.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={selected.has(star.id)}
                onClick={e => e.stopPropagation()}
                onChange={e => { const s = new Set(selected); e.target.checked ? s.add(star.id) : s.delete(star.id); setSelected(s); }}
              />
              <StatusBadge status={star.status} />
              <a
                href={`/cosmos/${star.question_id}?star=${star.shortcode}`}
                target="_blank" rel="noreferrer"
                style={{ ...S.mono, color: '#6af', textDecoration: 'none', fontSize: 12 }}
                onClick={e => e.stopPropagation()}
              >{star.shortcode}</a>
              <span style={{ ...S.mono, color: '#555', fontSize: 11, marginLeft: 'auto' }}>{relTime(star.created_at)}</span>
            </div>
            <div style={{ color: '#ddd', fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>{trunc(star.answer, 120)}</div>
            {star.unique_fact && <div style={{ color: '#777', fontSize: 12, marginBottom: 6 }}>{trunc(star.unique_fact, 80)}</div>}
            <div style={{ display: 'flex', gap: 0 }} onClick={e => e.stopPropagation()}>
              <button title="approve" onClick={() => quickAction(star.id, 'approved')} style={S.iconBtn}>✓</button>
              <button title="reject" onClick={() => quickAction(star.id, 'rejected')} style={S.iconBtn}>✗</button>
              <a title="preview" href={`/cosmos/${star.question_id}?star=${star.shortcode}`} target="_blank" rel="noreferrer" style={{ ...S.iconBtn, textDecoration: 'none' }}>👁</a>
              <button title="delete" onClick={() => quickDelete(star.id)} style={{ ...S.iconBtn, color: '#844' }}>🗑</button>
            </div>
          </div>
          {expanded === star.id && (
            <StarDetailPanel
              star={star}
              onClose={() => setExpanded(null)}
              onSaved={updated => setStars(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
              onDeleted={id => { setStars(prev => prev.filter(s => s.id !== id)); setExpanded(null); }}
            />
          )}
        </div>
      ); })}

      {!loading && stars.length === 0 && (
        <div style={{ padding: 32, color: '#444', textAlign: 'center' }}>No stars found.</div>
      )}

      {hasMore && (
        <div style={{ padding: '12px 16px' }}>
          <button onClick={() => { if (!loadingRef.current) load(page + 1); }} disabled={loading} style={S.btn()}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ConnectionsTab ───────────────────────────────────────────────────────────

function ConnectionsTab({ questionFilter }: { questionFilter: string }) {
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('approved');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const load = useCallback(async (pg = 0, reset = false) => {
    setLoading(true);
    const params = new URLSearchParams({
      status: statusFilter, page: String(pg), limit: '50',
      ...(questionFilter && { questionId: questionFilter }),
    });
    const res = await fetch(`/api/admin/connections?${params}`);
    const data = await res.json();
    const rows: AdminConnection[] = data.connections ?? [];
    setConnections(prev => reset ? rows : [...prev, ...rows]);
    setHasMore(rows.length === 50);
    setPage(pg);
    setLoading(false);
  }, [statusFilter, questionFilter]);

  useEffect(() => { load(0, true); setSelected(new Set()); setExpanded(null); }, [statusFilter, questionFilter, load]);

  async function quickAction(id: string, status: 'approved' | 'rejected') {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    const res = await fetch(`/api/admin/connections/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    if (!res.ok) load(page, true);
  }

  async function quickDelete(id: string) {
    setConnections(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/admin/connections/${id}`, { method: 'DELETE' });
  }

  async function bulkAction(action: 'approve' | 'reject' | 'delete') {
    const ids = [...selected];
    if (action === 'approve') {
      setConnections(prev => prev.map(c => selected.has(c.id) ? { ...c, status: 'approved' } : c));
    } else if (action === 'reject') {
      setConnections(prev => prev.map(c => selected.has(c.id) ? { ...c, status: 'rejected' } : c));
    } else {
      setConnections(prev => prev.filter(c => !selected.has(c.id)));
    }
    setSelected(new Set()); setBulkConfirm(false);
    await fetch('/api/admin/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, type: 'connection', ids }),
    });
  }

  const allChecked = connections.length > 0 && connections.every(c => selected.has(c.id));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={S.tab(statusFilter === s)}>{s}</button>
        ))}
      </div>

      {selected.size > 0 && (
        <div style={{ background: '#1a1400', padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#ffaa00', fontSize: 12 }}>{selected.size} selected</span>
          {!bulkConfirm ? (
            <>
              <button onClick={() => bulkAction('approve')} style={S.btn('primary')}>Approve</button>
              <button onClick={() => bulkAction('reject')} style={S.btn()}>Reject</button>
              <button onClick={() => setBulkConfirm(true)} style={S.btn('danger')}>Delete</button>
              <button onClick={() => setSelected(new Set())} style={S.btn()}>Deselect</button>
            </>
          ) : (
            <>
              <span style={{ color: '#cc4444', fontSize: 12 }}>Delete {selected.size} connections?</span>
              <button onClick={() => bulkAction('delete')} style={S.btn('danger')}>Confirm</button>
              <button onClick={() => setBulkConfirm(false)} style={S.btn()}>Cancel</button>
            </>
          )}
        </div>
      )}

      <div className="btw-admin-desktop" style={{ ...S.row, gridTemplateColumns: '24px 72px 1fr 1fr 200px 60px 70px 80px', borderBottom: '1px solid #222', background: '#0d0d0d', color: '#555', fontSize: 11 }}>
        <input type="checkbox" checked={allChecked} onChange={e => setSelected(e.target.checked ? new Set(connections.map(c => c.id)) : new Set())} />
        <span>status</span><span>from</span><span>to</span><span>reason</span><span>question</span><span>age</span><span>actions</span>
      </div>

      {loading && <div style={{ padding: 24, color: '#555', textAlign: 'center' }}>Loading…</div>}

      {connections.map(conn => (
        <div key={conn.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
          {/* Desktop row */}
          <div
            className="btw-admin-desktop"
            style={{ ...S.row, gridTemplateColumns: '24px 72px 1fr 1fr 200px 60px 70px 80px', borderBottom: 'none', cursor: 'pointer', background: expanded === conn.id ? '#181818' : 'transparent' }}
            onClick={() => setExpanded(e => e === conn.id ? null : conn.id)}
          >
            <input
              type="checkbox"
              checked={selected.has(conn.id)}
              onClick={e => e.stopPropagation()}
              onChange={e => { const s = new Set(selected); e.target.checked ? s.add(conn.id) : s.delete(conn.id); setSelected(s); }}
            />
            <StatusBadge status={conn.status} />
            <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ ...S.mono, color: '#6af' }}>{conn.from_star?.shortcode}</span>{' '}
              {trunc(conn.from_star?.answer ?? '', 50)}
            </span>
            <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ ...S.mono, color: '#6af' }}>{conn.to_star?.shortcode}</span>{' '}
              {trunc(conn.to_star?.answer ?? '', 50)}
            </span>
            <span style={{ color: '#aaa', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.reason}</span>
            <span style={{ ...S.mono, color: '#555', fontSize: 11 }}>{conn.question_id.slice(0, 6)}</span>
            <span style={{ color: '#555' }}>{relTime(conn.created_at)}</span>
            <span style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => quickAction(conn.id, 'approved')} style={S.iconBtn}>✓</button>
              <button onClick={() => quickAction(conn.id, 'rejected')} style={S.iconBtn}>✗</button>
              <button onClick={() => quickDelete(conn.id)} style={{ ...S.iconBtn, color: '#844' }}>🗑</button>
            </span>
          </div>
          {/* Mobile card */}
          <div
            className="btw-admin-card"
            style={{ padding: '10px 12px', cursor: 'pointer', background: expanded === conn.id ? '#181818' : 'transparent' }}
            onClick={() => setExpanded(e => e === conn.id ? null : conn.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input type="checkbox" checked={selected.has(conn.id)} onClick={e => e.stopPropagation()} onChange={e => { const s = new Set(selected); e.target.checked ? s.add(conn.id) : s.delete(conn.id); setSelected(s); }} />
              <StatusBadge status={conn.status} />
              <span style={{ ...S.mono, color: '#555', fontSize: 11, marginLeft: 'auto' }}>{relTime(conn.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 3 }}>
              <span style={{ ...S.mono, color: '#6af' }}>{conn.from_star?.shortcode}</span> {trunc(conn.from_star?.answer ?? '', 60)}
            </div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
              <span style={{ ...S.mono, color: '#6af' }}>{conn.to_star?.shortcode}</span> {trunc(conn.to_star?.answer ?? '', 60)}
            </div>
            {conn.reason && <div style={{ color: '#888', fontStyle: 'italic', fontSize: 12, marginBottom: 6 }}>"{trunc(conn.reason, 80)}"</div>}
            <div style={{ display: 'flex', gap: 0 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => quickAction(conn.id, 'approved')} style={S.iconBtn}>✓</button>
              <button onClick={() => quickAction(conn.id, 'rejected')} style={S.iconBtn}>✗</button>
              <button onClick={() => quickDelete(conn.id)} style={{ ...S.iconBtn, color: '#844' }}>🗑</button>
            </div>
          </div>
          {expanded === conn.id && (
            <ConnectionDetailPanel
              conn={conn}
              onClose={() => setExpanded(null)}
              onSaved={updated => setConnections(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))}
              onDeleted={id => { setConnections(prev => prev.filter(c => c.id !== id)); setExpanded(null); }}
            />
          )}
        </div>
      ))}

      {!loading && connections.length === 0 && (
        <div style={{ padding: 32, color: '#444', textAlign: 'center' }}>No connections found.</div>
      )}

      {hasMore && (
        <div style={{ padding: '12px 16px' }}>
          <button onClick={() => load(page + 1)} style={S.btn()}>Load more</button>
        </div>
      )}
    </div>
  );
}

// ─── SettingsTab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [about, setAbout] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        const entry = (d.settings ?? []).find((s: { key: string; value: string }) => s.key === 'about');
        setAbout(entry?.value ?? '');
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaveState('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'about', value: about }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 3000);
      } else {
        setSaveError(data.error ?? 'Unknown error');
        setSaveState('error');
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
      setSaveState('error');
    }
  }

  return (
    <div style={{ padding: '28px 24px', maxWidth: 680 }}>
      <div style={{ color: '#888', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        About — shown in the modal on the public cosmos page
      </div>
      <div style={{ color: '#555', fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
        Supports markdown links: <code style={{ color: '#aaa', background: '#1a1a1a', padding: '1px 5px', borderRadius: 3 }}>[link text](https://url.com)</code>
        {' '}· Double newline = new paragraph.
      </div>
      <textarea
        value={loaded ? about : 'Loading…'}
        onChange={e => { setAbout(e.target.value); if (saveState === 'error') setSaveState('idle'); }}
        disabled={!loaded}
        rows={16}
        style={{ ...S.textarea, width: '100%', fontSize: 14, lineHeight: 1.7 }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={save} disabled={saveState === 'saving' || !loaded} style={S.btn('primary')}>
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {saveState === 'saved' && <span style={{ color: '#00cc44', fontSize: 12 }}>Saved.</span>}
        {saveState === 'error' && <span style={{ color: '#ff6666', fontSize: 12 }}>⚠ {saveError}</span>}
      </div>
    </div>
  );
}

// ─── Mobile CSS injection ────────────────────────────────────────────────────
// Injected once; targets .btw-admin-* classes used in the star/connection rows.
const ADMIN_MOBILE_CSS = `
  .btw-admin-desktop { display: grid; }
  .btw-admin-card    { display: none; }
  @media (max-width: 700px) {
    .btw-admin-desktop { display: none !important; }
    .btw-admin-card    { display: block; }
    .btw-admin-filters { flex-wrap: wrap; }
    .btw-admin-search  { width: 100% !important; margin-left: 0 !important; }
  }
`;

function AdminStyles() {
  return <style>{ADMIN_MOBILE_CSS}</style>;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checking, setChecking] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<'stars' | 'connections' | 'settings'>('stars');
  const [questionFilter, setQuestionFilter] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const prevPending = useRef(0);
  const [pendingPulse, setPendingPulse] = useState(false);

  useEffect(() => {
    fetch('/api/admin/auth').then(r => setAuthed(r.ok));
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const data: Stats = await res.json();
    if (data.pendingStars > prevPending.current) {
      setPendingPulse(true);
      setTimeout(() => setPendingPulse(false), 2000);
    }
    prevPending.current = data.pendingStars;
    setStats(data);
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadStats();
    const interval = setInterval(loadStats, 30000);

    // Load questions
    fetch('/api/admin/stars?status=all&limit=200').then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      const seen = new Set<string>();
      const qs: Question[] = [];
      for (const s of (d.stars ?? []) as AdminStar[]) {
        const q = s.questions as Question | null | undefined;
        if (q && !seen.has(q.id)) { seen.add(q.id); qs.push(q); }
      }
      setQuestions(qs);
    });

    return () => clearInterval(interval);
  }, [authed, loadStats]);

  async function handleAuth() {
    setChecking(true); setAuthError('');
    const res = await fetch('/api/admin/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    });
    setChecking(false);
    if (res.ok) { setAuthed(true); } else { setAuthError('Incorrect password.'); }
  }

  async function logout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAuthed(false);
  }

  if (authed === null) {
    return <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>…</div>;
  }

  if (!authed) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 280 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.1em', color: '#555', marginBottom: 24, textAlign: 'center' }}>THE BETWEEN — ADMIN</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              placeholder="Password"
              autoFocus
              style={{ ...S.input, width: '100%', boxSizing: 'border-box' as const, paddingRight: 36 }}
            />
            <button
              type="button"
              onClick={() => setShowPass(s => !s)}
              title={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: showPass ? '#aaa' : '#555', padding: 2, lineHeight: 1, fontSize: 14,
              }}
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
          {authError && <div style={{ color: '#cc4444', fontSize: 12, marginBottom: 8 }}>{authError}</div>}
          <button onClick={handleAuth} disabled={checking} style={{ ...S.btn('primary'), width: '100%', padding: '10px' }}>
            {checking ? 'Checking…' : 'Enter →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <AdminStyles />
      <div style={S.topbar}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.08em', color: '#666', whiteSpace: 'nowrap' as const }}>ADMIN</span>
        {stats && (
          <span style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' as const }}>
            <span style={{ color: pendingPulse ? '#ffaa00' : '#888', fontWeight: pendingPulse ? 700 : 400, transition: 'color .3s' }}>
              {stats.pendingStars}↑
            </span>
            {' '}{stats.approvedStars}✓ {stats.rejectedStars}✗
          </span>
        )}
        <select value={questionFilter} onChange={e => setQuestionFilter(e.target.value)} style={{ ...S.input, marginLeft: 'auto', maxWidth: 160 }}>
          <option value="">All Qs</option>
          {questions.map(q => <option key={q.id} value={q.id}>{q.slug}</option>)}
        </select>
        <button onClick={logout} style={S.btn()}>Out</button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid #1a1a1a', background: '#0d0d0d' }}>
        <button onClick={() => setTab('stars')} style={S.tab(tab === 'stars')}>
          Stars{stats && stats.pendingStars > 0 && tab !== 'stars' && <span style={{ color: '#ffaa00', marginLeft: 4 }}>({stats.pendingStars})</span>}
        </button>
        <button onClick={() => setTab('connections')} style={S.tab(tab === 'connections')}>
          Connections{stats && stats.pendingConnections > 0 && tab !== 'connections' && <span style={{ color: '#ffaa00', marginLeft: 4 }}>({stats.pendingConnections})</span>}
        </button>
        <button onClick={() => setTab('settings')} style={S.tab(tab === 'settings')}>Settings</button>
      </div>

      {tab === 'stars' && <StarsTab questionFilter={questionFilter} />}
      {tab === 'connections' && <ConnectionsTab questionFilter={questionFilter} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
