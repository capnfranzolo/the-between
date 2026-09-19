'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toCanvas } from 'qrcode';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { starUrl } from '@/lib/constants';
import type { CosmosStarData } from './StarDetail';

// ── SaveSharePanel — Revision round 1, R2 (WEEKLY-SHARE-PLAN.md) ────────────
// SaveStarPanel + SharePanel merged into the ONE surface the owner asked for.
// Top to bottom, no section titles: the 9:16 story video (the artifact speaks
// for itself — no eyebrow, no answer caption), the plain link + Copy Link, the
// QR, then Save image / Save video, then a quiet platform row.
//
// Two things this panel fixes over its predecessors:
//
//  1. **Desktop saves are plain downloads.** SaveStarPanel reached for
//     `navigator.canShare` first, which on macOS Chrome/Safari raises the OS
//     share sheet — the owner hit that and it is wrong for a desktop "save".
//     The share-sheet path is now gated on a *touch* device, since desktop
//     browsers advertise `canShare` too.
//  2. **Every user-facing URL comes from the request origin** via
//     `starUrl()` — on staging the old hardcoded thebetween.world links
//     pointed at production, where the star does not exist.
//
// The QR renderer and the platform icons are duplicated from SaveStarPanel /
// SharePanel rather than imported: neither module exports its internals, and
// those two panels stay untouched until the call sites are swapped over.

const QR_SIZE = 108;

export interface SaveSharePanelProps {
  shortcode: string;
  star: Pick<CosmosStarData, 'text' | 'dimensions' | 'shortcode'>;
  questionText?: string;
  onClose: () => void;
}

type VideoState = 'composing' | 'ready' | 'unavailable';
type ActionState = 'idle' | 'working' | 'notready';

const DEFAULT_SHARE_TEXT = "A thought on The Between — what do you know is true but can't prove?";

/**
 * Touch/mobile detection — the gate for every share-sheet path.
 *
 * `navigator.canShare` alone is NOT a mobile signal: desktop Chrome and
 * Safari both implement it and will happily raise the macOS share sheet from
 * a Save button. A coarse pointer (or a real touch digitiser) is what
 * actually separates the phone from the laptop.
 */
function detectTouch(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
  return coarse || touchPoints;
}

// Social share URL builders — mirrors ShareButton/SharePanel's buildShareUrl
// (not exported by either). `url` is always the star's own /s/ page so the
// platform unfurls its OG image.
function buildShareUrl(platform: string, url: string, shareText: string): string {
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(shareText);
  switch (platform) {
    case 'facebook':  return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
    case 'x':         return `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`;
    case 'snapchat':  return `https://www.snapchat.com/scan?attachmentUrl=${encoded}`;
    default:          return url;
  }
}

// ── Icons (duplicated from ShareButton.tsx — unexported there) ─────────────

const FacebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0" fill="currentColor" strokeWidth="2.5" />
  </svg>
);

const SnapchatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C8.5 2 6 4.5 6 8v1.5C5.3 9.7 4.5 10 4 10c-.3.6 0 1 .5 1.2.2.1.4.1.5.2.5.2.9.7 1 1.4-.3.2-.6.4-.8.7-.3.4-.2.8.2 1 .5.3 1.2.5 2.1.6.3.7.9 1.2 1.5 1.6L8 17c-.5.3-.3.9.5 1 .5.1 1.1-.1 2-.4.5-.2.8-.1 1 0 .2.1.3.3.5.5.2.2.5.5 1 .5s.8-.3 1-.5c.2-.2.3-.4.5-.5.2-.1.5-.2 1 0 .9.3 1.5.5 2 .4.8-.1 1-.7.5-1l-1-.7c.6-.4 1.2-.9 1.5-1.6.9-.1 1.6-.3 2.1-.6.4-.2.5-.6.2-1-.2-.3-.5-.5-.8-.7.1-.7.5-1.2 1-1.4.1-.1.3-.1.5-.2.5-.2.8-.6.5-1.2-.5 0-1.3-.3-2-.5V8c0-3.5-2.5-6-6-6z" />
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const PLATFORM_ITEMS: Array<{ id: string; label: string; Icon: () => React.ReactElement }> = [
  { id: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { id: 'facebook',  label: 'Facebook',  Icon: FacebookIcon },
  { id: 'x',         label: 'X',         Icon: XIcon },
  { id: 'snapchat',  label: 'Snapchat',  Icon: SnapchatIcon },
];

// Client-side QR — cream on transparent, no border box, no logo. Lifted from
// SaveStarPanel (the treatment the owner approved); `qrcode`'s color option
// wants 8-digit hex RGBA.
function PanelQRCode({ url, size }: { url: string; size: number }) {
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

/** Plain download — anchor + object URL. No share sheet, ever. */
function downloadBlobUrl(objectUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// `star` stays in the props (SharePanel's shape, so the call sites swap over
// cleanly) but is deliberately not read here: the preview, the keepsake and
// the QR are all server-rendered from the shortcode, and R2 removed the
// answer caption — the video speaks for itself.
export default function SaveSharePanel({ shortcode, questionText, onClose }: SaveSharePanelProps) {
  // Origin-derived — never SITE_URL. Memoised so the QR does not re-render.
  const url = useMemo(() => starUrl(shortcode), [shortcode]);
  const posterUrl = `/api/story/${shortcode}/poster`;
  const mp4Url = `/api/story/${shortcode}`;
  const keepsakeUrl = `/api/keepsake/${shortcode}`;
  const shareText = questionText
    ? `A thought on The Between — ${questionText}`
    : DEFAULT_SHARE_TEXT;

  const [isTouch, setIsTouch] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>('composing');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<ActionState>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Touch detection runs client-side only — SSR renders the desktop shape,
  // which is the safe default (plain download, no Share button).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability probe; unavailable during render
    setIsTouch(detectTouch());
  }, []);

  // Fetch the MP4. One attempt — on a non-OK response (the 503 the route
  // sends when encoding fails) we settle into 'unavailable' for good and the
  // poster remains the preview. First render can take ~30s.
  useEffect(() => {
    let cancelled = false;
    fetch(mp4Url)
      .then(async res => {
        if (!res.ok) { if (!cancelled) setVideoState('unavailable'); return; }
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
        setVideoFile(new File([blob], `the-between-${shortcode}.mp4`, { type: 'video/mp4' }));
        setVideoState('ready');
      })
      .catch(() => { if (!cancelled) setVideoState('unavailable'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcode]);

  // Background prefetch of the poster as a File, so the Web-Share fallback
  // never has to `await fetch` between the click and `navigator.share` —
  // that would risk losing user activation on iOS.
  useEffect(() => {
    let cancelled = false;
    fetch(posterUrl)
      .then(res => (res.ok ? res.blob() : null))
      .then(blob => {
        if (cancelled || !blob) return;
        setPosterFile(new File([blob], `the-between-${shortcode}.png`, { type: 'image/png' }));
      })
      .catch(() => { /* Share still falls back to the URL/copy branches. */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcode]);

  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [videoUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No Clipboard API access — select the plainly-shown URL instead.
      urlInputRef.current?.select();
    }
  }, [url]);

  /** Save image — the keepsake PNG. Desktop downloads; touch may share-sheet. */
  const handleSaveImage = useCallback(async () => {
    if (saveState === 'working') return;
    setSaveState('working');
    try {
      const res = await fetch(keepsakeUrl);
      if (!res.ok) { setSaveState('idle'); setNotice('still forming — try again in a moment'); return; }
      const blob = await res.blob();
      const filename = `the-between-${shortcode}.png`;

      if (isTouch && typeof navigator !== 'undefined') {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file] }); }
          catch { /* sheet cancelled — quiet, not an error */ }
          setSaveState('idle');
          return;
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      downloadBlobUrl(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      setSaveState('idle');
    } catch {
      setSaveState('idle');
      setNotice('still forming — try again in a moment');
    }
  }, [keepsakeUrl, shortcode, saveState, isTouch]);

  /** Save video — the MP4 already in memory. Desktop downloads; touch may share-sheet. */
  const handleSaveVideo = useCallback(async () => {
    if (!videoUrl) return;
    const filename = `the-between-${shortcode}.mp4`;

    if (isTouch && videoFile && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [videoFile] })) {
      try { await navigator.share({ files: [videoFile] }); }
      catch { /* sheet cancelled */ }
      return;
    }

    try { downloadBlobUrl(videoUrl, filename); }
    catch { setNotice('still forming — try again in a moment'); }
  }, [videoUrl, videoFile, shortcode, isTouch]);

  // Share (mobile only): first capable branch wins — video file, poster file,
  // bare URL, then copy. A cancelled sheet is a quiet dismissal and does not
  // fall through further.
  const handleShare = useCallback(async () => {
    if (typeof navigator === 'undefined') { await handleCopy(); return; }

    if (videoFile && navigator.canShare?.({ files: [videoFile] })) {
      try { await navigator.share({ files: [videoFile] }); } catch { /* cancelled */ }
      return;
    }
    if (posterFile && navigator.canShare?.({ files: [posterFile] })) {
      try { await navigator.share({ files: [posterFile] }); } catch { /* cancelled */ }
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ url, text: shareText }); } catch { /* cancelled */ }
      return;
    }
    await handleCopy();
  }, [videoFile, posterFile, url, shareText, handleCopy]);

  const handlePlatform = useCallback(async (id: string) => {
    if (id === 'instagram') {
      // Instagram has no web share-intent URL. On a phone, hand it the video
      // (then the poster) through the share sheet; failing that, the Stories
      // URL scheme. On desktop there is nothing to open, and the share sheet
      // is exactly what the owner did not want — copy the link instead.
      if (isTouch && typeof navigator !== 'undefined') {
        const file = videoFile ?? posterFile;
        if (file && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file] }); return; }
          catch { /* fall through to the Stories scheme */ }
        }
        window.location.href =
          'instagram-stories://share?backgroundTopColor=%231E1840&backgroundBottomColor=%23A06880';
        return;
      }
      await handleCopy();
      setNotice('link copied — paste it into Instagram');
      return;
    }
    // Facebook / X / Snapchat unfurl the star's own page, so they get the
    // origin-derived /s/ URL.
    window.open(buildShareUrl(id, url, shareText), '_blank', 'noopener,noreferrer,width=600,height=500');
  }, [videoFile, posterFile, isTouch, url, shareText, handleCopy]);

  const composing = videoState === 'composing';

  const secondaryButton = (label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0,
        background: 'rgba(240,232,224,0.05)',
        border: `1px solid ${withAlpha(BTW.horizon[3], 0.55)}`,
        color: BTW.horizon[3],
        padding: '13px 14px',
        borderRadius: 13,
        fontFamily: SANS, fontSize: 12.5, fontWeight: 500,
        letterSpacing: '0.09em', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background .2s ease',
        touchAction: 'manipulation',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12); }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.05)'; }}
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        background: 'rgba(20,14,40,0.5)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(12px, 4vw, 40px)',
        animation: 'btwSaveShareFade .3s ease',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="btw-ss-panel"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          background: 'rgba(20,14,40,0.86)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
          borderRadius: 18,
          color: BTW.textPri,
          padding: '22px 22px 20px',
          textAlign: 'center',
          animation: 'btwSaveShareRise .38s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 6, right: 8,
            background: 'transparent', border: 'none',
            color: withAlpha(BTW.textPri, 0.55), fontSize: 22, cursor: 'pointer',
            lineHeight: 1, padding: 8, zIndex: 2,
          }}
        >
          ×
        </button>

        {/* 1 — The artifact. Poster immediately, MP4 inline when it lands.
            This is the one element allowed to shrink so the controls below
            are never cut off. */}
        <div
          className="btw-ss-preview-slot"
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              position: 'relative',
              height: '100%',
              width: 'auto',
              aspectRatio: '9 / 16',
              borderRadius: 14,
              overflow: 'hidden',
              border: `1px solid ${withAlpha(BTW.textPri, 0.16)}`,
              background: BTW.terrain[2],
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG, not a Next-optimizable static asset */}
            <img
              src={posterUrl}
              alt="The star's story"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', objectFit: 'cover',
                opacity: videoState === 'ready' ? 0 : 1,
                transition: 'opacity .5s ease',
              }}
            />

            {videoUrl && (
              <video
                src={videoUrl}
                autoPlay
                loop
                muted
                playsInline
                data-btw-story-video=""
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%', objectFit: 'cover',
                  opacity: videoState === 'ready' ? 1 : 0,
                  transition: 'opacity .5s ease',
                }}
              />
            )}

            {composing && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  padding: '0 16px 18px',
                  background: 'linear-gradient(180deg, transparent 40%, rgba(14,10,32,0.55) 100%)',
                }}
              >
                <div className="btw-ss-shimmer" />
                <div style={{
                  fontFamily: SERIF, fontStyle: 'italic', fontSize: 14,
                  color: withAlpha(BTW.textPri, 0.85), textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                }}>
                  composing…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2 — The link */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <input
            ref={urlInputRef}
            readOnly
            value={url}
            onFocus={e => e.currentTarget.select()}
            aria-label="The star's link"
            style={{
              flex: 1, minWidth: 0,
              background: 'rgba(240,232,224,0.06)',
              border: `1px solid ${withAlpha(BTW.textPri, 0.15)}`,
              borderRadius: 10, color: BTW.textSec,
              fontFamily: SANS, fontSize: 12.5,
              padding: '9px 11px', outline: 'none',
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
              padding: '9px 13px',
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

        {/* 3 — The QR */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{
            padding: 8,
            borderRadius: 12,
            border: `1px solid ${withAlpha(BTW.textPri, 0.1)}`,
            background: 'rgba(240,232,224,0.03)',
          }}>
            <PanelQRCode url={url} size={QR_SIZE} />
          </div>
        </div>

        {/* 4 — Saves. Desktop: plain download. Touch: share sheet when offered. */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, marginBottom: 12 }}>
          {secondaryButton(
            saveState === 'working' ? 'Preparing…' : 'Save image ↓',
            handleSaveImage,
            'save-image',
          )}
          {videoState === 'ready' && secondaryButton('Save video ↓', handleSaveVideo, 'save-video')}
        </div>

        {/* 5 — Platforms, and Share on a phone */}
        <div style={{
          flexShrink: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
        }}>
          {PLATFORM_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handlePlatform(id)}
              title={label}
              aria-label={`Share to ${label}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34,
                borderRadius: '50%',
                background: 'transparent',
                border: `1px solid ${withAlpha(BTW.textPri, 0.16)}`,
                color: BTW.textDim,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'color .2s, border-color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.6); }}
              onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.16); }}
            >
              <Icon />
            </button>
          ))}

          {isTouch && (
            <button
              onClick={handleShare}
              aria-label="Share"
              style={{
                marginLeft: 4,
                background: 'transparent',
                border: `1px solid ${withAlpha(BTW.horizon[3], 0.55)}`,
                color: BTW.horizon[3],
                height: 34,
                padding: '0 16px',
                borderRadius: 999,
                fontFamily: SANS, fontSize: 11.5, fontWeight: 500,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Share ↗
            </button>
          )}
        </div>

        <div
          aria-live="polite"
          style={{
            flexShrink: 0,
            minHeight: 16, marginTop: 8,
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
            color: BTW.textDim, opacity: notice ? 1 : 0,
            transition: 'opacity .3s ease',
          }}
        >
          {notice ?? ''}
        </div>
      </div>
      <style>{`
        @keyframes btwSaveShareFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes btwSaveShareRise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btwSaveShareShimmer {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        .btw-ss-panel { max-height: 94vh; max-height: 94dvh; }
        /* The preview asks for this much and gives it back, via flex-shrink,
           whenever the panel would otherwise outgrow the viewport. */
        .btw-ss-preview-slot { height: 340px; }
        @media (max-height: 800px) { .btw-ss-preview-slot { height: 300px; } }
        @media (max-height: 700px) { .btw-ss-preview-slot { height: 240px; } }
        .btw-ss-shimmer {
          position: absolute; inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .btw-ss-shimmer::after {
          content: '';
          position: absolute; top: 0; bottom: 0; left: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(240,232,224,0.08), transparent);
          animation: btwSaveShareShimmer 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
