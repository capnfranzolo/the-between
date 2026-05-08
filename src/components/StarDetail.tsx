'use client';
import { useRef, useEffect, useCallback } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import ShareButton from './ShareButton';
import { SITE_URL } from '@/lib/constants';
import { createSpirograph } from '@/lib/spirograph/renderer';
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

export interface UserStarContext {
  text: string;
  dimensions: CosmosStarData['dimensions'];
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
  userStar?: UserStarContext | null;
}

// Spirograph geometry (outerRadius=120 * zoom=1.4) needs ~400+ px canvas.
// Render at full size and CSS-scale down to avoid cropping.
const SPIRO_RENDER_SIZE = 600;

function ensureSmokeCSSDetail() {
  const SMOKE_STYLE_ID = 'btw-smoke-css';
  if (typeof document === 'undefined' || document.getElementById(SMOKE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = SMOKE_STYLE_ID;
  s.textContent = `
    @keyframes btwSmokeRise {
      0%   { opacity:0;    transform: translate(-50%,-100%) translateY(0px); }
      30%  { opacity:0.85; }
      100% { opacity:0.85; transform: translate(-50%,-100%) translateY(-24px); }
    }
    @keyframes btwSmokeSplit {
      0%   { opacity:0.85; transform: translate(0,0) scale(1);   filter:blur(0px); }
      100% { opacity:0;    transform: translate(var(--btw-sdx),var(--btw-sdy)) scale(0.65); filter:blur(6px); }
    }
    @keyframes btwSmokeSlideRight {
      0%   { opacity:0;    transform: translateY(-50%) translateX(0px); }
      25%  { opacity:0.85; }
      100% { opacity:0.85; transform: translateY(-50%) translateX(40px); }
    }
  `;
  document.head.appendChild(s);
}

// animVariant='slideRight' — smoke exits to the right from the star's right edge
// (used when star is inside the connect button so text flies into the cosmos).
function StarMini({ dims, size, text, animVariant = 'rise' }: {
  dims: CosmosStarData['dimensions'];
  size: number;
  text?: string;
  animVariant?: 'rise' | 'slideRight';
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const smokeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const smokeBubble = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Render at full geometry size, then CSS-scale to `size`
    const inst = createSpirograph(canvas, dims, { size: SPIRO_RENDER_SIZE, dpr: 1 });
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    let t = 0; let raf: number;
    const tick = () => { t += 0.016; inst.renderStatic(t); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); inst.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSmoke = useCallback(() => {
    smokeTimers.current.forEach(clearTimeout);
    smokeTimers.current = [];
    smokeBubble.current?.remove();
    smokeBubble.current = null;
  }, []);

  const showSmoke = useCallback(() => {
    if (smokeBubble.current || !text?.trim() || !wrapRef.current) return;
    ensureSmokeCSSDetail();
    const wrap = wrapRef.current;

    const bubble = document.createElement('div');
    const isSlide = animVariant === 'slideRight';
    const baseProps: [string, string][] = [
      ['position', 'absolute'],
      ['text-align', isSlide ? 'left' : 'center'],
      ['width', '200px'],
      ['max-width', '220px'],
      ['white-space', 'normal'],
      ['pointer-events', 'none'],
      ['font-family', "'Cormorant Garamond','Playfair Display',Georgia,serif"],
      ['font-style', 'italic'],
      ['font-weight', '300'],
      ['font-size', '17px'],
      ['line-height', '1.65'],
      ['color', 'rgba(240,232,224,0.82)'],
      ['text-shadow', '0 0 18px rgba(240,200,150,0.22)'],
      ['letter-spacing', '0.02em'],
      ['text-transform', 'none'],
      ['opacity', '0'],
      ['z-index', '99'],
    ];
    if (isSlide) {
      // Starts just right of the star, vertically centred
      baseProps.push(['left', `${size + 8}px`]);
      baseProps.push(['top', '50%']);
      baseProps.push(['animation', 'btwSmokeSlideRight 2s ease-out forwards']);
    } else {
      baseProps.push(['left', '50%']);
      baseProps.push(['bottom', 'calc(100% + 6px)']);
      baseProps.push(['animation', 'btwSmokeRise 2s ease-out forwards']);
    }
    baseProps.forEach(([p, v]) => bubble.style.setProperty(p, v));

    const words = text.trim().split(/\s+/).filter(Boolean);
    const spans: HTMLSpanElement[] = [];
    words.forEach(w => {
      const span = document.createElement('span');
      span.textContent = w + ' ';
      span.style.setProperty('display', 'inline');
      bubble.appendChild(span);
      spans.push(span);
    });
    wrap.appendChild(bubble);
    smokeBubble.current = bubble;

    const t1 = setTimeout(() => {
      if (!smokeBubble.current) return;
      bubble.style.setProperty('animation', 'none');
      bubble.style.setProperty('opacity', '0.85');
      if (isSlide) {
        bubble.style.setProperty('transform', `translateY(-50%) translateX(40px)`);
      } else {
        bubble.style.setProperty('transform', 'translate(-50%, -100%) translateY(-24px)');
      }
      spans.forEach((span, i) => {
        const ang  = Math.random() * Math.PI * 2;
        const dist = 45 + Math.random() * 70;
        // Slide variant biases disperse rightward and upward
        const dx = isSlide
          ? (20 + Math.random() * 80).toFixed(0)
          : (Math.cos(ang) * dist).toFixed(0);
        const dy = isSlide
          ? (-(Math.random() * 60 + 10)).toFixed(0)
          : (Math.sin(ang) * dist - 35).toFixed(0);
        span.style.setProperty('--btw-sdx', `${dx}px`);
        span.style.setProperty('--btw-sdy', `${dy}px`);
        span.style.setProperty('animation', `btwSmokeSplit 1.2s ease-out ${(i * 30 + Math.random() * 40).toFixed(0)}ms forwards`);
      });
    }, 1300);
    const t2 = setTimeout(() => clearSmoke(), 2600);
    smokeTimers.current = [t1, t2];
  }, [text, animVariant, size, clearSmoke]);

  useEffect(() => () => clearSmoke(), [clearSmoke]);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}
      onMouseEnter={text ? showSmoke : undefined}
      onMouseLeave={text ? clearSmoke : undefined}
    >
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  );
}

export default function StarDetail({
  star, hasMystar, userHasOutgoingBond, onConnect,
  connections, onConnectionClick, onDismiss, nudge, userStar,
}: StarDetailProps) {
  const url = `https://${SITE_URL}/s/${star.shortcode}`;
  const ogImageUrl = `https://${SITE_URL}/api/og/${star.shortcode}`;
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
  const showUserStar = userStar && showConnect;

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
        maxHeight: '56vh',
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
                    borderRadius: 4,
                    transition: 'color .15s, background .15s',
                  }}
                  onMouseEnter={c.relatedStarId && onConnectionClick ? e => {
                    e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  } : undefined}
                  onMouseLeave={c.relatedStarId && onConnectionClick ? e => {
                    e.currentTarget.style.color = '';
                    e.currentTarget.style.background = '';
                  } : undefined}
                >
                  {c.reason}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Sticky footer ── */}
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
        <ShareButton url={url} ogImageUrl={ogImageUrl} nudge={nudge} />

        {showConnect && (
          // Star icon sits to the left; button keeps its natural pill height
          <button
            onClick={onConnect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: showUserStar ? 12 : 0,
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: showUserStar ? '10px 18px 10px 10px' : '10px 18px',
              borderRadius: 999,
              fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12)}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {showUserStar && (
              <StarMini dims={userStar!.dimensions} size={36} />
            )}
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
