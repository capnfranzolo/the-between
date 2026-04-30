'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import CosmosScene from '@/components/cosmos/CosmosScene';
import { CosmosStarData } from '@/components/StarDetail';
import { CosmosBond } from '@/components/BondCurves';
import { BTW, SANS } from '@/lib/btw';

interface CosmosData {
  stars: CosmosStarData[];
  bonds: CosmosBond[];
}

export default function CosmosPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const [data, setData] = useState<CosmosData | null>(null);

  useEffect(() => {
    fetch(`/api/cosmos/${questionId}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [questionId]);

  return (
    <>
      <CosmosScene />

      <div style={{
        position: 'relative', zIndex: 1, height: '100vh', overflow: 'hidden',
        fontFamily: SANS, color: BTW.textPri, pointerEvents: 'none',
      }}>
        {/* Top chrome */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '22px 30px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 12, letterSpacing: '0.34em', textTransform: 'uppercase', color: BTW.textDim }}>
            The Between &middot; cosmos
          </div>
          {data && (
            <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em' }}>
              {data.stars.length} stars &middot; {data.bonds.length} bonds
            </div>
          )}
        </div>

        {/* Bottom hint */}
        <div style={{
          position: 'absolute', left: '50%', bottom: 28,
          transform: 'translateX(-50%)',
          fontSize: 13, color: BTW.textDim,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          hold space to drift faster
        </div>
      </div>
    </>
  );
}
