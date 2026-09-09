'use client';
import { BTW, SANS, SERIF, withAlpha } from '@/lib/btw';

export interface SkyRailQuestion {
  id: string;
  text: string;
  starCount: number;
}

interface SkyRailProps {
  questions: SkyRailQuestion[];
  currentId: string;
  onSelect: (id: string) => void;
  /** true while a crossfade is already in flight — ignore further clicks */
  disabled?: boolean;
}

// Short, quiet label for the rail — the full question text is shown large
// up top; the rail only needs enough to recognize a world at a glance.
function shortenQuestion(text: string, maxLen = 30): string {
  const stripped = text.replace(/[?.]+$/, '').trim();
  if (stripped.length <= maxLen) return stripped;
  const cut = stripped.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * A quiet, always-visible strip listing every active question ("world").
 * Sits just above the bottom controls on both desktop and mobile so it
 * never fights the drift dwell text or the drift pill for attention.
 * Clicking a different world hands off to the caller's crossfade — this
 * component only renders the list and reports the selection.
 */
export default function SkyRail({ questions, currentId, onSelect, disabled }: SkyRailProps) {
  if (questions.length < 2) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0, right: 0,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        className="btw-sky-rail-scroll"
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          maxWidth: 'calc(100vw - 24px)',
          overflowX: 'auto',
          padding: '6px 20px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {questions.map(q => {
          const isCurrent = q.id === currentId;
          return (
            <button
              key={q.id}
              onClick={() => { if (!isCurrent && !disabled) onSelect(q.id); }}
              disabled={disabled}
              title={q.text}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                borderBottom: isCurrent ? `1px solid ${withAlpha(BTW.textPri, 0.4)}` : '1px solid transparent',
                padding: '4px 2px 6px',
                cursor: disabled ? 'default' : 'pointer',
                opacity: isCurrent ? 1 : 0.45,
                transition: 'opacity .25s ease, border-color .25s ease',
                touchAction: 'manipulation',
              }}
              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.opacity = '0.45'; }}
            >
              <span
                aria-hidden
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  border: `1px solid ${BTW.textPri}`,
                  background: isCurrent ? BTW.textPri : 'transparent',
                  flexShrink: 0,
                }}
              />
              <span style={{
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                fontSize: 12.5, color: BTW.textPri, whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {shortenQuestion(q.text)}
              </span>
              <span style={{
                fontFamily: SANS, fontSize: 9.5, letterSpacing: '0.06em',
                color: BTW.textDim, whiteSpace: 'nowrap',
              }}>
                {q.starCount}
              </span>
            </button>
          );
        })}
      </div>
      <style>{`
        .btw-sky-rail-scroll { scrollbar-width: none; }
        .btw-sky-rail-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
