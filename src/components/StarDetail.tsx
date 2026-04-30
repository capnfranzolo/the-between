'use client';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import ShareButton from './ShareButton';
import Spirograph from './Spirograph';
import { SITE_URL } from '@/lib/constants';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

export interface CosmosStarData {
  id: string;
  shortcode: string;
  text: string;
  unique_fact?: string | null;
  x: number;
  y: number;
  depth: number;
  dimensions: DimensionResult & { curveType: CurveType };
  mine?: boolean;
}

interface StarDetailProps {
  star: CosmosStarData;
  hasMystar: boolean;
  onConnect: () => void;
  connections?: Array<{ reason: string }>;
}

export default function StarDetail({ star, hasMystar, onConnect, connections }: StarDetailProps) {
  const url = `https://${SITE_URL}/s/${star.shortcode}`;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%', bottom: 28,
        transform: 'translateX(-50%)',
        width: 'min(720px, 90%)',
        background: 'rgba(20,14,40,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.18)}`,
        borderRadius: 18,
        padding: '24px 28px',
        color: BTW.textPri,
        zIndex: 6,
        pointerEvents: 'auto',
        animation: 'btwRise .45s cubic-bezier(.2,.7,.3,1)',
      }}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <Spirograph dimensions={star.dimensions} size={88} animate />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, lineHeight: 1.4, color: BTW.textPri }}>
            &ldquo;{star.text}&rdquo;
          </div>
        </div>
      </div>

      {star.unique_fact && (
        <div style={{
          marginTop: 16,
          paddingLeft: 14,
          borderLeft: `2px solid ${withAlpha(BTW.horizon[3], 0.55)}`,
          fontFamily: SANS, fontSize: 14,
          lineHeight: 1.45, color: BTW.textSec,
        }}>
          <span style={{
            display: 'block', fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: BTW.horizon[3], opacity: 0.8, marginBottom: 4,
          }}>
            something unique
          </span>
          {star.unique_fact}
        </div>
      )}

      {connections && connections.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: BTW.horizon[3], opacity: 0.8, marginBottom: 8,
          }}>
            connected because
          </div>
          {connections.map((c, i) => (
            <div key={i} style={{
              paddingLeft: 14,
              borderLeft: `2px solid ${withAlpha(BTW.horizon[2], 0.45)}`,
              fontFamily: SANS, fontSize: 13,
              lineHeight: 1.45, color: BTW.textSec,
              marginBottom: i < connections.length - 1 ? 8 : 0,
            }}>
              {c.reason}
            </div>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 18, display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 16,
      }}>
        <ShareButton url={url} />
        {hasMystar && !star.mine && (
          <button
            onClick={onConnect}
            style={{
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: '10px 18px', borderRadius: 999,
              fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: 'pointer', fontFamily: SANS,
            }}
            onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.15)}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Connect your star to this →
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
