'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toCanvas } from 'qrcode';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import { createSpirograph, withSeed } from '@/lib/spirograph/renderer';
import type { CosmosStarData } from './StarDetail';

// ── SaveStarPanel — Stage B (WEEKLY-SHARE-PLAN.md) ──────────────────────────
// "We don't know who you are, so keep this if you want to come back." A quiet
// keepsake surface: the star, its URL, a QR code, and one obvious way to save
// the server-rendered PNG. No accounts, no identity — the URL is the only
// persistence, exactly like `my_star` in localStorage.

const SPIRO_RENDER_SIZE = 600;
const MINI_SIZE = 132;
const QR_SIZE = 132;

export interface SaveStarPanelProps {
  shortcode: string;
  star: Pick<CosmosStarData, 'text' | 'dimensions' | 'shortcode'>;
  onClose: () => void;
}

// Mirrors StarDetail's StarMini render pattern (full-geometry render,
// CSS-scaled down) but without the hover-smoke behaviour — this is a quiet
// keepsake, not an interactive panel row.
function SaveStarMini({ dims, size }: { dims: CosmosStarData['dimensions']; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const inst = createSpirograph(canvas, dims, { size: SPIRO_RENDER_SIZE, dpr: 1 });
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    let t = 0;
    let raf: number;
    const tick = () => { t += 0.016; inst.renderStatic(t); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); inst.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}

// Client-side QR render — cream foreground, transparent background, quiet
// (no border box, no logo). `qrcode`'s color option wants 8-digit hex RGBA.
function SaveQRCode({ url, size }: { url: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFailed(false);
    toCanvas(canvas, url, {
      width: size,
      margin: 1,
      color: {
        dark: `${BTW.textPri}ff`,
        light: '#00000000',
      },
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url, size]);

  if (failed) return null;
  return <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} />;
}

type SaveState = 'idle' | 'working' | 'notready';

export default function SaveStarPanel({ shortcode, star, onClose }: SaveStarPanelProps) {
  const url = `https://${SITE_URL}/s/${shortcode}`;
  const keepsakeUrl = `/api/keepsake/${shortcode}`;
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (saveState !== 'notready') return;
    const t = setTimeout(() => setSaveState('idle'), 4200);
    return () => clearTimeout(t);
  }, [saveState]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without Clipboard API access — select the
      // plainly-shown URL so the visitor can copy it manually.
      urlInputRef.current?.select();
    }
  }, [url]);

  const handleSave = useCallback(async () => {
    if (saveState === 'working') return;
    setSaveState('working');
    try {
      const res = await fetch(keepsakeUrl);
      if (!res.ok) { setSaveState('notready'); return; }
      const blob = await res.blob();
      const filename = `the-between-${shortcode}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch {
          // Visitor cancelled the share sheet — quiet, not an error state.
        }
        setSaveState('idle');
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      setSaveState('idle');
    } catch {
      setSaveState('notready');
    }
  }, [keepsakeUrl, shortcode, saveState]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        background: 'rgba(20,14,40,0.5)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(16px, 5vw, 40px)',
        animation: 'btwSavePanelFade .3s ease',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="btw-save-panel-cap"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          overflowY: 'auto',
          background: 'rgba(20,14,40,0.86)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
          borderRadius: 18,
          color: BTW.textPri,
          padding: '30px 28px 26px',
          textAlign: 'center',
          animation: 'btwSaveRise .38s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 10, right: 12,
            background: 'transparent', border: 'none',
            color: withAlpha(BTW.textPri, 0.55), fontSize: 22, cursor: 'pointer',
            lineHeight: 1, padding: 8,
          }}
        >
          ×
        </button>

        {/* The star */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <SaveStarMini dims={withSeed(star.dimensions, star.shortcode)} size={MINI_SIZE} />
        </div>

        {/* The sentence */}
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
          fontSize: 'clamp(17px, 4vw, 20px)', lineHeight: 1.5,
          color: BTW.textPri, marginBottom: 22,
          padding: '0 4px',
        }}>
          We don&rsquo;t know who you are, so keep this if you want to come back.
        </div>

        {/* URL — plain, selectable */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 22 }}>
          <input
            ref={urlInputRef}
            readOnly
            value={url}
            onFocus={e => e.currentTarget.select()}
            aria-label="Your star's link"
            style={{
              flex: 1, minWidth: 0,
              background: 'rgba(240,232,224,0.06)',
              border: `1px solid ${withAlpha(BTW.textPri, 0.15)}`,
              borderRadius: 10, color: BTW.textSec,
              fontFamily: SANS, fontSize: 13,
              padding: '10px 12px', outline: 'none',
              textOverflow: 'ellipsis',
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: `1px solid ${copied ? withAlpha(BTW.horizon[3], 0.7) : withAlpha(BTW.textPri, 0.22)}`,
              color: copied ? BTW.horizon[3] : BTW.textDim,
              padding: '10px 14px',
              borderRadius: 10,
              fontFamily: SANS, fontSize: 11, fontWeight: 500,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'color .2s, border-color .2s',
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        {/* QR code — quiet, cream on transparent */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <div style={{
            padding: 10,
            borderRadius: 12,
            border: `1px solid ${withAlpha(BTW.textPri, 0.1)}`,
            background: 'rgba(240,232,224,0.03)',
          }}>
            <SaveQRCode url={url} size={QR_SIZE} />
          </div>
        </div>

        {/* Save this image — obvious through size/placement, not color */}
        <button
          onClick={handleSave}
          disabled={saveState === 'working'}
          style={{
            width: '100%',
            background: 'rgba(240,232,224,0.05)',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.65)}`,
            color: BTW.horizon[3],
            padding: '16px 20px',
            borderRadius: 14,
            fontFamily: SANS, fontSize: 14, fontWeight: 500,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: saveState === 'working' ? 'default' : 'pointer',
            opacity: saveState === 'working' ? 0.6 : 1,
            transition: 'opacity .2s ease, background .2s ease',
            touchAction: 'manipulation',
          }}
          onMouseEnter={e => { if (saveState !== 'working') e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12); }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.05)'; }}
        >
          {saveState === 'working' ? 'Preparing…' : 'Save this image ↓'}
        </button>

        <div style={{
          minHeight: 18, marginTop: 10,
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
          color: BTW.textDim, opacity: saveState === 'notready' ? 1 : 0,
          transition: 'opacity .3s ease',
        }}>
          still forming — try again in a moment
        </div>
      </div>
      <style>{`
        @keyframes btwSavePanelFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes btwSaveRise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .btw-save-panel-cap { max-height: 90vh; max-height: 90dvh; }
      `}</style>
    </div>
  );
}
