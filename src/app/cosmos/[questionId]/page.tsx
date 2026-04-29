'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import CosmosView from '@/components/CosmosView';
import TwilightSky from '@/components/TwilightSky';
import { CosmosStarData } from '@/components/StarDetail';
import { CosmosBond } from '@/components/BondCurves';

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

  if (!data) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <TwilightSky />
      </div>
    );
  }

  return <CosmosView stars={data.stars} bonds={data.bonds} questionId={questionId} />;
}
