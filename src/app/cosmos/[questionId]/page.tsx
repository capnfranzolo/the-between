'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import { createSpirograph } from '@/lib/spirograph/renderer';
import CosmosScene, { type ThoughtData, type BondData, type CosmosSceneHandle } from '@/components/cosmos/CosmosScene';
import StarDetail, { type CosmosStarData } from '@/components/StarDetail';
import ConnectionDrawer from '@/components/ConnectionDrawer';
import ControlsHint from '@/components/ControlsHint';
import AboutModal from '@/components/AboutModal';
import AddToHomeScreen from '@/components/AddToHomeScreen';
import { type CosmosBond } from '@/components/BondCurves';
import { BTW, SANS, SERIF, mulberry32, hashString } from '@/lib/btw';

const DIM_DEFAULTS = { certainty: 0.5, warmth: 0.5, tension: 0.5, vulnerability: 0.5, scope: 0.5, rootedness: 0.5, emotionIndex: 3, curveType: 'hypotrochoid' as const, reasoning: '' };

interface CosmosData {
  question: { id: string; text: string } | null;
  stars: CosmosStarData[];
  bonds: CosmosBond[];
}

function starWorldPos(shortcode: string): { x: number; y: number; z: number } {
  const rand = mulberry32(hashString(shortcode));
  const x = (rand() - 0.5) * 1000;
  const z = (rand() - 0.5) * 1000;
  const y = 80 + rand() * 60;
  return { x, y, z };
}

const PENDING_BOND_KEY = (starId: string) => `btw_pending_bond_${starId}`;

// ── Shared inline star canvas ──────────────────────────────────────────────────
// createSpirograph sets canvas.style.width/height = size + 'px' internally,
// so we just pass the display size directly — no multiplier needed.
function StarMiniInline({ star, size }: { star: CosmosStarData; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = star.dimensions ?? DIM_DEFAULTS;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const inst = createSpirograph(canvas, dims, { size, dpr: 1 });
    let t = 0; let raf: number;
    const tick = () => { t += 0.016; inst.renderStatic(t); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); inst.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [star.id]);
  // No CSS size needed — createSpirograph sets canvas.style directly
  return <canvas ref={canvasRef} style={{ display: 'block', flexShrink: 0 }} />;
}


export default function CosmosPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const searchParams = useSearchParams();
  const starParam = searchParams.get('star');
  const [data, setData] = useState<CosmosData | null>(null);
  const [allQuestions, setAllQuestions] = useState<{ id: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectConfirmed, setConnectConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [localBonds, setLocalBonds] = useState<CosmosBond[]>([]);
  const [myShortcode] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('my_star') : null,
  );
  const [showAbout, setShowAbout] = useState(false);
  const [triggerControlsHint, setTriggerControlsHint] = useState(false);
  const sceneRef = useRef<CosmosSceneHandle>(null);
  const autoFocused = useRef(false);
  const panelDismissedOnce = useRef(false);

  // Fetch all questions so we can cycle to the next one
  useEffect(() => {
    fetch('/api/questions')
      .then(r => r.json())
      .then(d => setAllQuestions(d.questions ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/cosmos/${questionId}`)
      .then(r => r.json())
      .then((d: CosmosData) => {
        const stars = d.stars.map(s => ({
          ...s,
          text: (s as unknown as { answer?: string }).answer ?? s.text,
        }));
        setData({ ...d, stars });

        if (myShortcode) {
          const myStarId = stars.find(s => s.shortcode === myShortcode)?.id;
          if (myStarId) {
            const raw = localStorage.getItem(PENDING_BOND_KEY(myStarId));
            if (raw) {
              try {
                const b = JSON.parse(raw) as { fromStarId: string; toStarId: string; reason: string };
                setLocalBonds([{
                  id: 'pending-' + b.fromStarId,
                  from_id: b.fromStarId,
                  to_id: b.toStarId,
                  reason: b.reason,
                }]);
              } catch { /* ignore corrupt entry */ }
            }
          }
        }
      })
      .catch(() => {});
  }, [questionId, myShortcode]);

  const allStars = useMemo(() => data?.stars ?? [], [data]);

  const bonds = useMemo(
    () => [...(data?.bonds ?? []), ...localBonds],
    [data, localBonds],
  );

  const thoughts = useMemo<ThoughtData[]>(() => {
    if (!allStars.length) return [];
    const positions = new Map<string, { x: number; y: number; z: number }>();
    for (const star of allStars) {
      positions.set(star.id, starWorldPos(star.shortcode));
    }
    // Put the user's own star first so it's always within the baked-spirograph cap
    const myId = myShortcode ? allStars.find(s => s.shortcode === myShortcode)?.id : undefined;
    const sorted = myId
      ? [...allStars].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0))
      : allStars;
    return sorted.map(star => {
      const dims = star.dimensions ?? DIM_DEFAULTS;
      return {
        id: star.id,
        ...positions.get(star.id)!,
        emotionIndex: dims.emotionIndex,
        dimensions: dims,
        answer: star.text ?? '',
      };
    });
  }, [allStars, myShortcode]);

  const byId = useMemo(() => {
    const m: Record<string, CosmosStarData> = {};
    allStars.forEach(s => { m[s.id] = s; });
    return m;
  }, [allStars]);

  const userStarId = useMemo(() => {
    if (!myShortcode) return null;
    return data?.stars.find(s => s.shortcode === myShortcode)?.id ?? null;
  }, [myShortcode, data]);

  const selectedStar = useMemo(() => {
    if (!selected) return null;
    const star = byId[selected];
    if (!star) return null;
    return userStarId ? { ...star, mine: star.id === userStarId } : star;
  }, [selected, byId, userStarId]);

  const sceneBonds = useMemo<BondData[]>(
    () => bonds.map(b => ({ id: b.id, from_id: b.from_id, to_id: b.to_id, reason: b.reason })),
    [bonds],
  );

  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    return bonds
      .filter(b => b.from_id === selected || b.to_id === selected)
      .map(b => ({
        reason: b.reason,
        relatedStarId: b.from_id === selected ? b.to_id : b.from_id,
      }));
  }, [selected, bonds]);

  const userHasOutgoingBond = useMemo(() => {
    if (!userStarId) return false;
    if (bonds.some(b => b.from_id === userStarId)) return true;
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(PENDING_BOND_KEY(userStarId));
  }, [userStarId, bonds]);

  const handleThoughtClick = (id: string) => {
    setSelected(id);
    setConnecting(false);
    setConnectConfirmed(false);
    setReason('');
    sceneRef.current?.flyToThought(id);
  };

  const handleConnect = async (targetId: string) => {
    if (!userStarId || reason.trim().length < 4) return;
    const savedReason = reason.trim();
    const newBond: CosmosBond = {
      id: 'local-' + Date.now(),
      from_id: userStarId,
      to_id: targetId,
      reason: savedReason,
    };

    setLocalBonds(b => [...b, newBond]);
    setReason('');
    setConnecting(false);
    setConnectConfirmed(true);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStarId: userStarId,
          toStarId: targetId,
          reason: savedReason,
          questionId,
        }),
      });
      const payload = await res.json();
      if (payload.ok) {
        localStorage.setItem(PENDING_BOND_KEY(userStarId), JSON.stringify({
          fromStarId: userStarId, toStarId: targetId, reason: savedReason,
        }));
      }
    } catch { /* bond already shown optimistically */ }
  };

  const initialShortcode = starParam ?? myShortcode;

  // Auto-focus initial star (from ?star= param or user's own star) when cosmos first loads
  useEffect(() => {
    if (!autoFocused.current && data) {
      const initialStarId = initialShortcode
        ? data.stars.find(s => s.shortcode === initialShortcode)?.id ?? null
        : null;
      if (initialStarId) {
        autoFocused.current = true;
        setSelected(initialStarId);
        setTimeout(() => sceneRef.current?.flyToThought(initialStarId), 80);
      }
    }
  }, [initialShortcode, data]);

  const clearSelection = () => {
    setSelected(null);
    setConnecting(false);
    setConnectConfirmed(false);
    setReason('');
    // Trigger controls hint the first time a panel is dismissed
    if (!panelDismissedOnce.current) {
      panelDismissedOnce.current = true;
      setTriggerControlsHint(true);
    }
  };

  return (
    <>
      <CosmosScene
        ref={sceneRef}
        thoughts={thoughts}
        bonds={sceneBonds}
        activeStar={selected}
        userStar={userStarId}
        paused={!!selected}
        onThoughtClick={handleThoughtClick}
        onBackgroundClick={clearSelection}
      />

      <div
        style={{
          position: 'relative', zIndex: 1, height: '100vh', overflow: 'hidden',
          fontFamily: SANS, color: BTW.textPri, pointerEvents: 'none',
        }}
      >
        {/* Top chrome — question + next-question link */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '22px 30px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          pointerEvents: 'none',
        }}>
          {data?.question?.text && (
            <div style={{
              fontFamily: SERIF, fontStyle: 'italic',
              fontSize: 'clamp(22px, 3.2vw, 36px)',
              color: BTW.textPri,
              letterSpacing: '0.01em',
              textAlign: 'center',
              maxWidth: 900,
              lineHeight: 1.2,
              opacity: 0.35,
              pointerEvents: 'none',
            }}>
              {data.question.text}
            </div>
          )}

          {/* Next question — upper-right on desktop, below question on mobile */}
          {allQuestions.length > 1 && (() => {
            const idx = allQuestions.findIndex(q => q.id === questionId);
            const next = allQuestions[(idx + 1) % allQuestions.length];
            const sharedStyle: React.CSSProperties = {
              background: 'transparent', border: 'none',
              color: BTW.textDim, cursor: 'pointer',
              fontFamily: SANS, letterSpacing: '0.22em',
              textTransform: 'uppercase', pointerEvents: 'auto',
              transition: 'opacity .2s',
            };
            return (
              <>
                {/* Desktop: fixed upper-right */}
                <button
                  className="btw-next-q-desktop"
                  onClick={() => { window.location.href = `/cosmos/${next.id}`; }}
                  style={{ ...sharedStyle, fontSize: 11, padding: '6px 0', opacity: 0.55 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.55'; }}
                >
                  Next question ›
                </button>
                {/* Mobile: inline below question, centered */}
                <button
                  className="btw-next-q-mobile"
                  onClick={() => { window.location.href = `/cosmos/${next.id}`; }}
                  style={{ ...sharedStyle, fontSize: 10, padding: '4px 0', opacity: 0.28 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.55'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.28'; }}
                >
                  Next question ›
                </button>
              </>
            );
          })()}
        </div>

        {/* Edge hotspot indicators — pointer-events none; canvas handles actual click */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: '10%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{ fontSize: 18, color: BTW.textDim, opacity: 0.18, userSelect: 'none' }}>‹</span>
        </div>
        <div style={{
          position: 'absolute', right: 0, top: 0, width: '10%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{ fontSize: 18, color: BTW.textDim, opacity: 0.18, userSelect: 'none' }}>›</span>
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '5%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{ fontSize: 18, color: BTW.textDim, opacity: 0.18, userSelect: 'none' }}>∧</span>
        </div>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '5%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{ fontSize: 18, color: BTW.textDim, opacity: 0.18, userSelect: 'none' }}>∨</span>
        </div>

        {/* Star detail panel */}
        {selectedStar && !connecting && !connectConfirmed && (
          <StarDetail
            star={selectedStar}
            hasMystar={!!userStarId}
            userHasOutgoingBond={userHasOutgoingBond}
            onConnect={() => setConnecting(true)}
            connections={selectedConnections}
            onConnectionClick={handleThoughtClick}
            onDismiss={clearSelection}
            nudge={hashString(selectedStar.shortcode) % 5 === 0}
            userStar={userStarId && byId[userStarId] && !selectedStar.mine
              ? { text: byId[userStarId].text, dimensions: byId[userStarId].dimensions }
              : null}
          />
        )}

        {/* Connection confirmation */}
        {connectConfirmed && selectedStar && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '50%', bottom: 28,
              transform: 'translateX(-50%)',
              width: 'min(520px, 90%)',
              background: 'rgba(20,14,40,0.78)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BTW.horizon[3]}44`,
              borderRadius: 18,
              padding: '28px 32px',
              textAlign: 'center',
              zIndex: 6,
              pointerEvents: 'auto',
              animation: 'btwRise .45s cubic-bezier(.2,.7,.3,1)',
            }}
          >
            <div style={{ fontFamily: SERIF, fontSize: 20, color: BTW.textPri, lineHeight: 1.4 }}>
              Your stars are bound.
            </div>
            <button
              onClick={clearSelection}
              style={{
                marginTop: 22, background: 'transparent',
                border: `1px solid ${BTW.textPri}44`,
                color: BTW.textDim,
                fontFamily: SANS, fontSize: 11, letterSpacing: '0.18em',
                textTransform: 'uppercase', cursor: 'pointer',
                padding: '10px 20px', borderRadius: 999,
              }}
            >
              continue exploring
            </button>
          </div>
        )}

        {/* Connection drawer */}
        {connecting && selectedStar && (
          <ConnectionDrawer
            reason={reason}
            onChange={setReason}
            onCancel={() => { setConnecting(false); setReason(''); }}
            onSubmit={() => handleConnect(selectedStar.id)}
            userStar={userStarId && byId[userStarId]
              ? { text: byId[userStarId].text, dimensions: byId[userStarId].dimensions }
              : null}
          />
        )}

        <style>{`
          @keyframes btwRise {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
          /* Desktop: next-question floats upper-right, mobile version hidden */
          .btw-next-q-desktop {
            position: absolute;
            top: calc(env(safe-area-inset-top, 0px) + 24px);
            right: 20px;
          }
          .btw-next-q-mobile { display: none !important; }

          /* Mobile: width breakpoint OR touch-only device */
          @media (max-width: 768px), (hover: none) and (pointer: coarse) {
            .btw-next-q-desktop { display: none !important; }
            .btw-next-q-mobile  { display: block !important; }
          }
        `}</style>
      </div>

      {/* ── Bottom chrome — outside overflow:hidden overlay so it's never
          clipped on iOS. zIndex:0 keeps it above the canvas but below the
          overlay div (zIndex:1) which contains StarDetail (zIndex:6 within
          that context). StarDetail therefore always paints on top. ── */}
      <div style={{
        position: 'fixed',
        left: 0, right: 0,
        bottom: 0,
        height: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 24px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        zIndex: 0,
        pointerEvents: 'none',
      }}>
        {/* Brand + user's star to the right (hidden when viewing own star) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setShowAbout(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase',
              color: BTW.textDim, padding: '6px 0',
              minHeight: 44,
              transition: 'color .2s',
              fontFamily: SANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
            onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
          >
            The Between
          </button>
          {userStarId && byId[userStarId] && !selectedStar?.mine && (
            <StarMiniInline star={byId[userStarId]} size={80} />
          )}
        </div>

        {/* Add star */}
        <button
          onClick={() => { window.location.href = `/?question=${questionId}`; }}
          title="Add your thought"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(240,232,224,0.07)',
            border: '1px solid rgba(240,232,224,0.18)',
            color: BTW.textDim, fontSize: 22,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s, border-color .2s',
            pointerEvents: 'auto',
            touchAction: 'manipulation',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.14)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.07)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.18)'; }}
        >
          +
        </button>
      </div>

      <ControlsHint
        trigger={triggerControlsHint}
        onDone={() => setTriggerControlsHint(false)}
      />

      <AddToHomeScreen />

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

    </>
  );
}
