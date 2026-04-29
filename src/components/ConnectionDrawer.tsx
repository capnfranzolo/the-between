'use client';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/constants';

interface ConnectionDrawerProps {
  reason: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function ConnectionDrawer({ reason, onChange, onCancel, onSubmit }: ConnectionDrawerProps) {
  const ready = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%', bottom: 28,
        transform: 'translateX(-50%)',
        width: 'min(640px, 88%)',
        background: 'rgba(20,14,40,0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${withAlpha(BTW.horizon[3], 0.4)}`,
        borderRadius: 18,
        padding: '22px 26px',
        color: BTW.textPri,
        zIndex: 7,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 20, color: BTW.textPri, marginBottom: 14 }}>
        Why do these belong together?
      </div>
      <input
        value={reason}
        onChange={e => onChange(e.target.value.slice(0, MAX_REASON_LENGTH))}
        autoFocus
        placeholder="Because they're both about…"
        onKeyDown={e => { if (e.key === 'Enter' && ready) onSubmit(); }}
        style={{
          width: '100%',
          background: 'rgba(240,232,224,0.06)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.25)}`,
          borderRadius: 12,
          color: BTW.textPri,
          fontFamily: SERIF,
          fontSize: 19,
          padding: '14px 16px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 }}>
        <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em' }}>
          {reason.length}/{MAX_REASON_LENGTH}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`,
              color: BTW.textDim, padding: '10px 18px', borderRadius: 999,
              fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!ready}
            style={{
              background: ready ? withAlpha(BTW.horizon[3], 0.22) : 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], ready ? 0.7 : 0.25)}`,
              color: BTW.horizon[3],
              padding: '10px 20px', borderRadius: 999,
              fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: ready ? 'pointer' : 'default',
              fontFamily: SANS, transition: 'all .3s',
            }}
          >
            Bind them
          </button>
        </div>
      </div>
    </div>
  );
}
