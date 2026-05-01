'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import CosmosScene, { type ThoughtData, type BondData, type CosmosSceneHandle } from '@/components/cosmos/CosmosScene';
import StarDetail, { type CosmosStarData } from '@/components/StarDetail';
import ConnectionDrawer from '@/components/ConnectionDrawer';
import AboutModal from '@/components/AboutModal';
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

export default function CosmosPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const searchParams = useSearchParams();
  const starParam = searchParams.get('star');
  const [data, setData] = useState<CosmosData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectConfirmed, setConnectConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [localBonds, setLocalBonds] = useState<CosmosBond[]>([]);
  const [myShortcode] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('my_star') : null,
  );
  const [showAbout, setShowAbout] = useState(false);
  const sceneRef = useRef<CosmosSceneHandle>(null);
  const autoFocused = useRef(false);

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
        {/* Top chrome */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '22px 30px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          }}>
            {data && (
              <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em' }}>
                {data.stars.length} stars &middot; {bonds.length} bonds
              </div>
            )}
          </div>
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
        </div>

        {/* Bottom hint */}
        {!selected && !connecting && (
          <div style={{
            position: 'absolute', left: '50%', bottom: 28,
            transform: 'translateX(-50%)',
            fontSize: 13, color: BTW.textDim,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            hold space to drift faster &middot; click a star to read it
          </div>
        )}

        {/* Edge hotspot indicators — pointer-events none; canvas handles actual click */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: '5%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{ fontSize: 18, color: BTW.textDim, opacity: 0.18, userSelect: 'none' }}>‹</span>
        </div>
        <div style={{
          position: 'absolute', right: 0, top: 0, width: '5%', height: '100%',
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
          />
        )}

        {/* Bottom-left: brand + add-star button */}
        <div style={{
          position: 'absolute', left: 24, bottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
          pointerEvents: 'auto', zIndex: 3,
        }}>
          <button
            onClick={() => { window.location.href = '/'; }}
            title="Add your thought"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(240,232,224,0.07)',
              border: '1px solid rgba(240,232,224,0.18)',
              color: BTW.textDim, fontSize: 20, lineHeight: '30px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .2s, border-color .2s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.14)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.07)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.18)'; }}
          >
            +
          </button>
          <button
            onClick={() => setShowAbout(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase',
              color: BTW.textDim, padding: 0,
              transition: 'color .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
            onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
          >
            The Between
          </button>
        </div>

        <style>{`
          @keyframes btwRise {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}
