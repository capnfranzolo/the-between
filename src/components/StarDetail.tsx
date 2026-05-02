'use client';
import { useRef, useEffect } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import ShareButton from './ShareButton';
import { SITE_URL } from '@/lib/constants';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

export interface CosmosStarData {
  id: string;
  shortcode: string;
  text: string;
  unique_fact?: string | null;
  x?: number;
  y?: number;
  depth?: number;
  dimensions: DimensionResult & { curveType: CurveType };
  mine?: boolean;
}

interface StarDetailProps {
  star: CosmosStarData;
  hasMystar: boolean;
  userHasOutgoingBond?: boolean;
  onConnect: () => void;
  connections?: Array<{ reason: string; relatedStarId?: string }>;
  onConnectionClick?: (id: string) => void;
  onDismiss?: () => void;
  nudge?: boolean;
}

export default function StarDetail({
  star, hasMystar, userHasOutgoingBond, onConnect,
  connections, onConnectionClick, onDismiss, nudge,
}: StarDetailProps) {
  const url = `https://${SITE_URL}/s/${star.shortcode}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startY: 0, startScrollTop: 0 });

  // Swipe-down-to-dismiss on the drag handle
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !onDismiss) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only react to touches starting on the drag handle (top 44px of panel)
      const rect = panel.getBoundingClientRect();
      const touchY = e.touches[0].clientY - rect.top;
      if (touchY > 44) return;
      dragRef.current = { active: true, startY: e.touches[0].clientY, startScrollTop: panel.scrollTop };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.active) return;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      if (dy > 60) {
        dragRef.current.active = false;
        onDismiss();
      }
    };
    const onTouchEnd = () => { dragRef.current.active = false; };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove',  onTouchMove,  { passive: true });
    panel.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove',  onTouchMove);
      panel.removeEventListener('touchend',   onTouchEnd);
    };
  }, [onDismiss]);

  const showConnect = hasMystar && !star.mine && !userHasOutgoingBond;

  return (
    <div
      ref={panelRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: 'min(560px, 100%)',
        // Use flex column so the footer is always visible — only the
        // content area scrolls. Cap at 52vh so the star stays visible.
        maxHeight: '52vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(20,14,40,0.82)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
        borderBottom: 'none',
        borderRadius: '18px 18px 0 0',
        color: BTW.textPri,
        zIndex: 6,
        pointerEvents: 'auto',
        animation: 'btwRise .38s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      {/* Drag handle — flex-shrink: 0 so it never scrolls away */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '12px 0 6px',
        cursor: 'grab',
        flexShrink: 0,
      }}>
        <div style={{
          width: 40, height: 4,
          borderRadius: 2,
          background: withAlpha(BTW.textPri, 0.25),
        }} />
      </div>

      {/* Scrollable content area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        padding: '4px 24px 12px',
      }}>
        {/* Answer text */}
        <div style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 'clamp(18px, 4vw, 22px)',
          lineHeight: 1.45, color: BTW.textPri,
        }}>
          &ldquo;{star.text}&rdquo;
        </div>

        {/* Byline */}
        {star.unique_fact && (
          <div style={{
            marginTop: 10,
            paddingLeft: 16,
            fontFamily: SANS, fontSize: 13,
            lineHeight: 1.45, color: BTW.textSec,
            fontStyle: 'italic',
          }}>
            — {star.unique_fact}
          </div>
        )}

        {/* Connections */}
        {connections && connections.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
              color: BTW.horizon[3], opacity: 0.8, marginBottom: 8,
            }}>
              connected
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {connections.map((c, i) => (
                <div
                  key={i}
                  onClick={c.relatedStarId && onConnectionClick ? () => onConnectionClick(c.relatedStarId!) : undefined}
                  style={{
                    paddingLeft: 14,
                    borderLeft: `2px solid ${withAlpha(BTW.horizon[2], 0.45)}`,
                    fontFamily: SANS, fontSize: 13,
                    lineHeight: 1.45, color: BTW.textSec,
                    minHeight: 44, display: 'flex', alignItems: 'center',
                    cursor: c.relatedStarId && onConnectionClick ? 'pointer' : 'default',
                  }}
                >
                  {c.reason}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky footer — always visible above the home indicator ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        borderTop: `1px solid ${withAlpha(BTW.textPri, 0.07)}`,
      }}>
        <ShareButton url={url} nudge={nudge} />

        {showConnect && (
          <button
            onClick={onConnect}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: '12px 18px', minHeight: 44,
              borderRadius: 999,
              fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
              // Explicit touch-action so iOS doesn't eat the tap
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.15)}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Connect your star →
          </button>
        )}

        {star.mine && (
          <div style={{ fontSize: 12, color: BTW.horizon[3], letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            your star
          </div>
        )}
      </div>
    </div>
  );
}
