'use client';
import { useRef, useEffect, useCallback } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { createSpirograph, withSeed } from '@/lib/spirograph/renderer';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

export interface CosmosStarData {
  id: string;
  shortcode: string;
  text: string;
  unique_fact?: string | null;
  dimensions: DimensionResult & { curveType: CurveType };
  mine?: boolean;
  /** Only ever populated for the requester's own star (see /api/cosmos's
   *  `mine` param) — never exposed for anyone else's. */
  status?: string;
}

export interface UserStarContext {
  text: string;
  /** Needed as the Phase 5 archetype seed so the mini preview matches the sky. */
  shortcode: string;
  dimensions: CosmosStarData['dimensions'];
}

interface StarDetailProps {
  star: CosmosStarData;
  hasMystar: boolean;
  userHasOutgoingBond?: boolean;
  onConnect: () => void;
  connections?: Array<{ id?: string; reason: string; relatedStarId?: string }>;
  onConnectionClick?: (id: string) => void;
  onDismiss?: () => void;
  userStar?: UserStarContext | null;
  /** Defect #5 — visitor has no star of their own in this cosmos. */
  onAnswerCTA?: () => void;
  /** The tour countdown — a quiet ring filling toward the next star.
   *  `running` starts the fill (restarting whenever `restartKey` changes),
   *  `paused` freezes it (the visitor chose to stay); clicking toggles. */
  tour?: { running: boolean; paused: boolean; durationMs: number; restartKey: string; onToggle: () => void };
  /** Phase 8 — this panel opened on the star that was just born. */
  justBorn?: boolean;
  /** R3 — the born panel's "→": dismisses this panel and hands the sky back
   *  to the tour (the old "Explore nearby stars" behaviour, unlabelled). */
  onExplore?: () => void;
  /** R3 — the ONE door to the unified SaveSharePanel. Wired for every star:
   *  your own (a labelled "Save & share") and a stranger's (the share icon in
   *  the footer, which now opens the same panel for THAT star). */
  onSaveShare?: () => void;
  /** Defect #9 — this is the star the visitor's own star already orbits. */
  isBondTarget?: boolean;
  /** The LLM gate spec: never say "flagged"/"pending"/"moderation" — the
   *  submitter's own star simply "will rise into the shared sky once it's
   *  seen" while awaiting the human queue. Only ever true on `star.mine`. */
  pendingRise?: boolean;
  /** The visitor's own star (elsewhere in this cosmos, not necessarily
   *  `star`) hasn't cleared the queue yet — the connect affordance stays
   *  hidden everywhere until it does, the same as if they had no star at
   *  all, so a not-yet-public star can never author a public bond. */
  myStarPending?: boolean;
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
export function StarMini({ dims, size, text, animVariant = 'rise' }: {
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
  connections, onConnectionClick, onDismiss, userStar, onAnswerCTA,
  justBorn, isBondTarget, pendingRise, myStarPending, tour,
  onExplore, onSaveShare,
}: StarDetailProps) {
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

  const showConnect = hasMystar && !star.mine && !userHasOutgoingBond && !myStarPending;
  const showUserStar = userStar && showConnect;
  // Defect #9 — the one-bond rule is explained where the affordance was, never
  // silently missing. On the star the visitor actually bound to, the state is
  // not a refusal but a fact.
  const spentOnAnother = hasMystar && !star.mine && !!userHasOutgoingBond && !isBondTarget;
  const spentOnThis    = hasMystar && !star.mine && !!userHasOutgoingBond && !!isBondTarget;

  // ── R3 — one door, for every star ───────────────────────────────────────
  // Save and Share merged: the unified panel carries the link + QR (the only
  // way back to a star) and the story video, so it opens for a star that
  // hasn't cleared the queue too — the video simply isn't there yet.
  const canSaveShare = !!onSaveShare;
  // The born moment: one line, one invitation, an arrow, one door.
  const bornPanel = !!justBorn && !!star.mine;
  // Any later visit to your own star: the same door, quieter and labeled.
  const ownActions = !bornPanel && !!star.mine && canSaveShare;

  const footerFrame: React.CSSProperties = {
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px 12px 20px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
    borderTop: `1px solid ${withAlpha(BTW.textPri, 0.07)}`,
  };
  // The born panel's one action: a full-width pill, legible at 390px.
  const bornBtn: React.CSSProperties = {
    background: 'transparent',
    borderRadius: 999,
    padding: '13px 18px',
    minHeight: 46,
    fontFamily: SANS, fontSize: 12, fontWeight: 500,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    touchAction: 'manipulation',
    transition: 'background .2s, border-color .2s',
  };
  // The same doors on a later visit — smaller, still labeled.
  const ownBtn: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${withAlpha(BTW.textPri, 0.22)}`,
    color: BTW.textSec,
    borderRadius: 999,
    padding: '9px 14px',
    minHeight: 40,
    fontFamily: SANS, fontSize: 11, fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    touchAction: 'manipulation',
    transition: 'background .2s, border-color .2s, color .2s',
  };

  return (
    <div
      ref={panelRef}
      className="btw-panel-cap"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
        width: 'min(560px, 100%)',
        // Use flex column so the footer is always visible — only the
        // content area scrolls. Height cap lives in .btw-panel-cap (dvh with
        // vh fallback) so the footer clears iOS Safari's toolbar.
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <div
                    onClick={c.relatedStarId && onConnectionClick ? () => onConnectionClick(c.relatedStarId!) : undefined}
                    style={{
                      flex: 1,
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
                  {/* R3 — "share this pair" retires everywhere; bond sharing
                      is parked until single-star sharing is right. The /b/
                      route and its OG image stay, just with no entry point. */}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── R3 — the born footer: "Here is your star.", the invitation to
          explore, the arrow that takes you there, and one door to Save &
          share. No tour ring: the tour is already paused on your own star,
          and a countdown ring would rush the one beat that shouldn't be. ── */}
      {bornPanel ? (
      <div style={{
        ...footerFrame,
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        padding: '14px 20px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        gap: 12,
      }}>
        <div style={{
          fontFamily: SERIF, fontSize: 20, lineHeight: 1.35,
          color: BTW.textPri, textAlign: 'center',
        }}>
          Here is your star.
        </div>
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 17,
          lineHeight: 1.5, color: BTW.textDim, textAlign: 'center',
        }}>
          Explore the other stars, and you can pick one for your star to orbit.
        </div>
        {/* The one line that survives from the old pile: a star still in the
            queue is told, quietly, that it will rise. */}
        {pendingRise && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
            lineHeight: 1.5, color: BTW.textDim, opacity: 0.75,
            textAlign: 'center',
          }}>
            it will rise into the shared sky once it’s seen.
          </div>
        )}
        {onExplore && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={onExplore}
              aria-label="Explore the other stars"
              title="Explore the other stars"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                border: `1px solid ${withAlpha(BTW.horizon[3], 0.6)}`,
                color: BTW.horizon[3],
                fontFamily: SANS, fontSize: 15, lineHeight: 1,
                cursor: 'pointer',
                touchAction: 'manipulation',
                transition: 'background .2s, border-color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12); }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              →
            </button>
          </div>
        )}
        {canSaveShare && (
          <button
            onClick={onSaveShare}
            style={{
              ...bornBtn,
              border: `1px solid ${withAlpha(BTW.textPri, 0.24)}`,
              color: BTW.textSec,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.textPri, 0.07); }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            Save &amp; share
          </button>
        )}
      </div>
      ) : (
      /* ── Sticky footer: save & share | centered action | tour ring ── */
      <div style={footerFrame}>
        {/* R3 — a stranger's star gets the same icon it always had, but it
            now opens the unified panel for THAT star. Your own star's door is
            the labeled action on the right; the icon would say it twice. */}
        {!ownActions && canSaveShare && (
          <SaveShareIconButton onClick={onSaveShare!} />
        )}

        <div style={{
          flex: 1, minWidth: 0, display: 'flex',
          justifyContent: 'center', alignItems: 'center',
        }}>
        {showConnect && (
          // Star icon sits to the left; button keeps its natural pill height
          <button
            onClick={onConnect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: showUserStar ? 12 : 0,
              // Stage A — a shade more presence for a visitor who has a star
              // and hasn't spent its one orbit yet: the same quiet pill, lit.
              background: withAlpha(BTW.horizon[3], 0.10),
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.85)}`,
              boxShadow: `0 0 20px ${withAlpha(BTW.horizon[3], 0.13)}`,
              color: BTW.horizon[3],
              padding: showUserStar ? '10px 18px 10px 10px' : '10px 18px',
              borderRadius: 999,
              fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.2)}
            onMouseLeave={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.1)}
          >
            {showUserStar && (
              <StarMini dims={withSeed(userStar!.dimensions, userStar!.shortcode)} size={36} />
            )}
            Connect your star →
          </button>
        )}

        {spentOnAnother && (
          <button
            type="button"
            disabled
            aria-disabled="true"
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
              color: BTW.textDim,
              padding: '9px 14px',
              borderRadius: 999,
              fontSize: 10, fontWeight: 400, letterSpacing: '0.14em',
              textTransform: 'uppercase', lineHeight: 1.5,
              textAlign: 'right', maxWidth: 200, whiteSpace: 'normal',
              cursor: 'default', fontFamily: SANS,
            }}
          >
            your star already orbits another
          </button>
        )}

        {spentOnThis && (
          <div style={{
            fontSize: 10, color: BTW.horizon[3], opacity: 0.85,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            textAlign: 'right', maxWidth: 200, lineHeight: 1.5,
          }}>
            your star orbits this one
          </div>
        )}

        {star.mine && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 10, flexWrap: 'wrap',
          }}>
          <div style={{
            fontSize: 12, color: BTW.horizon[3],
            letterSpacing: pendingRise ? '0.08em' : '0.18em',
            textTransform: pendingRise ? 'none' : 'uppercase', textAlign: 'right', lineHeight: 1.5,
            maxWidth: pendingRise ? 200 : undefined,
            whiteSpace: pendingRise ? 'normal' : undefined,
            fontStyle: pendingRise ? 'italic' : undefined,
            fontFamily: pendingRise ? SERIF : undefined,
          }}>
            {/* The born moment has its own footer now (see bornPanel), so
                this label only ever speaks for a later visit. */}
            {pendingRise
              ? 'it will rise into the shared sky once it’s seen.'
              : 'your star'}
          </div>
          {/* R3 — one labeled door on every later visit */}
          {canSaveShare && (
            <button
              onClick={onSaveShare}
              style={ownBtn}
              onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.textPri, 0.07); e.currentTarget.style.color = BTW.textPri; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = BTW.textSec; }}
            >
              Save &amp; share
            </button>
          )}
          </div>
        )}

        {/* Defect #5 — shared-link visitor with no star of their own in this
            cosmos gets a door in, not a dead end. */}
        {!hasMystar && onAnswerCTA && (
          <button
            onClick={onAnswerCTA}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: '10px 18px',
              borderRadius: 999,
              fontSize: 13, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
              touchAction: 'manipulation',
            }}
            onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12)}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            What shape are you? →
          </button>
        )}
        </div>

        {tour ? <TourRing tour={tour} /> : <div style={{ width: 34, flexShrink: 0 }} />}
      </div>
      )}
    </div>
  );
}

// ── R3 — the save/share door on a stranger's panel. The same 34px icon the
// retired ShareButton used, so nothing moves in the footer; it now opens the
// unified SaveSharePanel for the star on screen instead of a share tray. ────
const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

function SaveShareIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Save & share this star"
      aria-label="Save & share this star"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'transparent',
        border: `1px solid ${withAlpha(BTW.textPri, 0.18)}`,
        color: BTW.textDim,
        cursor: 'pointer',
        transition: 'color .2s, border-color .2s, background .2s',
        flexShrink: 0,
        touchAction: 'manipulation',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = BTW.textPri;
        e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.6);
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = BTW.textDim;
        e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.18);
      }}
    >
      <ShareIcon />
    </button>
  );
}

// ── The tour ring — a 34px button whose ring fills toward the next star.
// Pure CSS animation (no re-renders beside the WebGL loop): stroke-dashoffset
// runs durationMs linear, restarted by keying on the star, frozen via
// animation-play-state when the visitor chooses to stay. ─────────────────────
const RING_C = 2 * Math.PI * 14; // r=14 circumference

function ensureTourRingCSS() {
  const ID = 'btw-tour-ring-css';
  if (typeof document === 'undefined' || document.getElementById(ID)) return;
  const el = document.createElement('style');
  el.id = ID;
  el.textContent = `@keyframes btwTourFill { from { stroke-dashoffset: ${RING_C}; } to { stroke-dashoffset: 0; } }`;
  document.head.appendChild(el);
}

function TourRing({ tour }: { tour: NonNullable<StarDetailProps['tour']> }) {
  useEffect(() => { ensureTourRingCSS(); }, []);
  const { running, paused, durationMs, restartKey, onToggle } = tour;
  return (
    <button
      key={restartKey}
      onClick={onToggle}
      aria-label={paused ? 'Continue to the next star' : 'Stay with this star'}
      title={paused ? 'next star' : 'stay here'}
      style={{
        width: 34, height: 34, flexShrink: 0,
        position: 'relative',
        background: 'transparent',
        border: 'none', padding: 0,
        cursor: 'pointer',
        color: BTW.textDim,
        touchAction: 'manipulation',
      }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" style={{ position: 'absolute', inset: 0 }}>
        <circle cx="17" cy="17" r="14" fill="none" stroke={withAlpha(BTW.textPri, 0.12)} strokeWidth="1.5" />
        {running && !paused && (
          <circle
            cx="17" cy="17" r="14" fill="none"
            stroke={withAlpha(BTW.horizon[3], 0.75)} strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            transform="rotate(-90 17 17)"
            style={{ animation: `btwTourFill ${durationMs}ms linear forwards` }}
          />
        )}
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: paused ? 13 : 8, letterSpacing: 0,
        color: paused ? BTW.horizon[3] : BTW.textDim,
        fontFamily: SANS,
      }}>
        {paused ? '→' : '❚❚'}
      </span>
    </button>
  );
}
