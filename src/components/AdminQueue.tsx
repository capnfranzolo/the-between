'use client';
import { useState } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';

interface PendingStar {
  id: string;
  shortcode: string;
  answer: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface PendingConnection {
  id: string;
  from_star_id: string;
  to_star_id: string;
  reason: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface AdminQueueProps {
  pendingStars: PendingStar[];
  pendingConnections: PendingConnection[];
  onAction: (type: 'star' | 'connection', id: string, action: 'approve' | 'reject', edit?: string) => Promise<void>;
}

function QueueCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(240,232,224,0.04)',
      border: `1px solid ${withAlpha(BTW.textPri, 0.12)}`,
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function ActionButtons({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button
        onClick={onApprove}
        style={{
          background: withAlpha(BTW.horizon[3], 0.18),
          border: `1px solid ${withAlpha(BTW.horizon[3], 0.6)}`,
          color: BTW.horizon[3], padding: '8px 16px', borderRadius: 999,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: SANS,
        }}
      >
        Approve
      </button>
      <button
        onClick={onReject}
        style={{
          background: 'transparent',
          border: `1px solid ${withAlpha(BTW.textDim, 0.4)}`,
          color: BTW.textDim, padding: '8px 16px', borderRadius: 999,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: SANS,
        }}
      >
        Reject
      </button>
    </div>
  );
}

export default function AdminQueue({ pendingStars, pendingConnections, onAction }: AdminQueueProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
      {/* Stars queue */}
      <div style={{ marginBottom: 40 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
          color: BTW.horizon[3], marginBottom: 16,
        }}>
          Pending Stars ({pendingStars.length})
        </div>
        {pendingStars.length === 0 && (
          <div style={{ color: BTW.textDim, fontSize: 14 }}>No pending stars.</div>
        )}
        {pendingStars.map(star => (
          <QueueCard key={star.id}>
            <div style={{ fontSize: 11, color: BTW.textDim, letterSpacing: '0.1em', marginBottom: 8 }}>
              /s/{star.shortcode} · {new Date(star.created_at).toLocaleDateString()}
            </div>
            {editingId === star.id ? (
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                style={{
                  width: '100%', background: 'rgba(240,232,224,0.08)',
                  border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`, borderRadius: 8,
                  color: BTW.textPri, fontFamily: SERIF, fontSize: 16,
                  padding: '10px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box',
                }}
              />
            ) : (
              <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.5, color: BTW.textPri }}>
                "{star.answer}"
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  await onAction('star', star.id, 'approve', editingId === star.id ? editText : undefined);
                  setEditingId(null);
                }}
                style={{
                  background: withAlpha(BTW.horizon[3], 0.18),
                  border: `1px solid ${withAlpha(BTW.horizon[3], 0.6)}`,
                  color: BTW.horizon[3], padding: '8px 16px', borderRadius: 999,
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: SANS,
                }}
              >
                Approve
              </button>
              {editingId === star.id ? (
                <button onClick={() => setEditingId(null)} style={{
                  background: 'transparent', border: `1px solid ${withAlpha(BTW.textDim, 0.4)}`,
                  color: BTW.textDim, padding: '8px 16px', borderRadius: 999,
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: SANS,
                }}>Cancel</button>
              ) : (
                <button onClick={() => { setEditingId(star.id); setEditText(star.answer); }} style={{
                  background: 'transparent', border: `1px solid ${withAlpha(BTW.textSec, 0.3)}`,
                  color: BTW.textSec, padding: '8px 16px', borderRadius: 999,
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: SANS,
                }}>Edit</button>
              )}
              <button onClick={() => onAction('star', star.id, 'reject')} style={{
                background: 'transparent', border: `1px solid ${withAlpha(BTW.textDim, 0.4)}`,
                color: BTW.textDim, padding: '8px 16px', borderRadius: 999,
                fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: SANS,
              }}>Reject</button>
            </div>
          </QueueCard>
        ))}
      </div>

      {/* Connections queue */}
      <div>
        <div style={{
          fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
          color: BTW.horizon[3], marginBottom: 16,
        }}>
          Pending Bonds ({pendingConnections.length})
        </div>
        {pendingConnections.length === 0 && (
          <div style={{ color: BTW.textDim, fontSize: 14 }}>No pending bonds.</div>
        )}
        {pendingConnections.map(conn => (
          <QueueCard key={conn.id}>
            <div style={{ fontSize: 11, color: BTW.textDim, letterSpacing: '0.1em', marginBottom: 8 }}>
              {conn.from_star_id.slice(0, 8)} ↔ {conn.to_star_id.slice(0, 8)} · {new Date(conn.created_at).toLocaleDateString()}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.5, color: BTW.textPri }}>
              "{conn.reason}"
            </div>
            <ActionButtons
              onApprove={() => onAction('connection', conn.id, 'approve')}
              onReject={() => onAction('connection', conn.id, 'reject')}
            />
          </QueueCard>
        ))}
      </div>
    </div>
  );
}
