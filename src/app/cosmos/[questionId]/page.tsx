'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import CosmosScene, { type ThoughtData, type BondData, type CosmosSceneHandle } from '@/components/cosmos/CosmosScene';
import StarDetail, { type CosmosStarData } from '@/components/StarDetail';
import ConnectionDrawer from '@/components/ConnectionDrawer';
import { type CosmosBond } from '@/components/BondCurves';
import { BTW, SANS, mulberry32, hashString } from '@/lib/btw';

interface CosmosData {
  stars: CosmosStarData[];
  bonds: CosmosBond[];
}

// Deterministic 3D world position from a star's shortcode
function starWorldPos(shortcode: string): { x: number; y: number; z: number } {
  const rand = mulberry32(hashString(shortcode));
  const x = (rand() - 0.5) * 1000; // –500 to 500
  const z = (rand() - 0.5) * 1000;
  const y = 60 + rand() * 70;       // 60–130
  return { x, y, z };
}

export default function CosmosPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const [data, setData] = useState<CosmosData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reason, setReason] = useState('');
  const [localBonds, setLocalBonds] = useState<CosmosBond[]>([]);
  // Lazy init reads sessionStorage once on mount (client-only)
  const [myShortcode] = useState<string | null>(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem('my_star') : null,
  );
  const sceneRef = useRef<CosmosSceneHandle>(null);

  useEffect(() => {
    fetch(`/api/cosmos/${questionId}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [questionId]);

  // All bonds: server-loaded + any the user added this session
  const bonds = useMemo(
    () => [...(data?.bonds ?? []), ...localBonds],
    [data, localBonds],
  );

  // Compute deterministic 3D positions, pulling bonded stars together
  const thoughts = useMemo<ThoughtData[]>(() => {
    if (!data) return [];

    const positions = new Map<string, { x: number; y: number; z: number }>();
    for (const star of data.stars) {
      positions.set(star.id, starWorldPos(star.shortcode));
    }

    // For each bond, pull to_id near from_id (first bond wins per star)
    const repositioned = new Set<string>();
    for (const bond of bonds) {
      const fromPos = positions.get(bond.from_id);
      if (!fromPos || repositioned.has(bond.to_id)) continue;
      const rand = mulberry32(hashString(bond.from_id + bond.to_id));
      const angle = rand() * Math.PI * 2;
      const dist = 20 + rand() * 20; // 20–40 units
      const curTo = positions.get(bond.to_id);
      if (curTo) {
        positions.set(bond.to_id, {
          x: fromPos.x + Math.cos(angle) * dist,
          z: fromPos.z + Math.sin(angle) * dist,
          y: fromPos.y + (rand() - 0.5) * 20,
        });
        repositioned.add(bond.to_id);
      }
    }

    return data.stars.map(star => ({
      id: star.id,
      ...positions.get(star.id)!,
      emotionIndex: star.dimensions.emotionIndex,
      dimensions: star.dimensions,
    }));
  }, [data, bonds]);

  const byId = useMemo(() => {
    const m: Record<string, CosmosStarData> = {};
    (data?.stars ?? []).forEach(s => { m[s.id] = s; });
    return m;
  }, [data]);

  const selectedStar = useMemo(() => {
    if (!selected) return null;
    const star = byId[selected];
    if (!star) return null;
    return myShortcode ? { ...star, mine: star.shortcode === myShortcode } : star;
  }, [selected, byId, myShortcode]);

  const sceneBonds = useMemo<BondData[]>(
    () => bonds.map(b => ({ id: b.id, from_id: b.from_id, to_id: b.to_id, reason: b.reason })),
    [bonds],
  );

  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    return bonds
      .filter(b => b.from_id === selected || b.to_id === selected)
      .map(b => ({ reason: b.reason }));
  }, [selected, bonds]);

  const userStarId = useMemo(() => {
    if (!myShortcode || !data) return null;
    return data.stars.find(s => s.shortcode === myShortcode)?.id ?? null;
  }, [myShortcode, data]);

  const handleThoughtClick = (id: string) => {
    setSelected(id);
    setConnecting(false);
    setReason('');
    sceneRef.current?.flyToThought(id);
  };

  const handleConnect = async (targetId: string) => {
    if (!myShortcode || reason.trim().length < 4) return;
    const newBond: CosmosBond = {
      id: 'local-' + Date.now(),
      from_id: myShortcode,
      to_id: targetId,
      reason: reason.trim(),
    };
    try {
      await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_shortcode: myShortcode, to_star_id: targetId,
          reason: reason.trim(), question_id: questionId,
        }),
      });
    } catch { /* optimistic */ }
    setLocalBonds(b => [...b, newBond]);
    setReason('');
    setConnecting(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setConnecting(false);
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
          padding: '22px 30px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 12, letterSpacing: '0.34em', textTransform: 'uppercase', color: BTW.textDim }}>
            The Between &middot; cosmos
          </div>
          {data && (
            <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em' }}>
              {data.stars.length} stars &middot; {bonds.length} bonds
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

        {/* Star detail panel */}
        {selectedStar && !connecting && (
          <StarDetail
            star={selectedStar}
            hasMystar={!!myShortcode}
            onConnect={() => setConnecting(true)}
            connections={selectedConnections}
          />
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

        <style>{`
          @keyframes btwRise {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>
      </div>
    </>
  );
}
