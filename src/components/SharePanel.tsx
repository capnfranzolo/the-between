'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import { SITE_URL } from '@/lib/constants';
import type { CosmosStarData } from './StarDetail';

// ── SharePanel — Stage D (WEEKLY-SHARE-PLAN.md) ─────────────────────────────
// The star-sharing path: an overlay whose centerpiece is a 9:16 preview of the
// server-rendered story — the poster the instant the panel opens, the MP4
// swapped in inline once `/api/story/[shortcode]` responds. Primary Share
// prefers the Web-Share-file trick (video, then poster, then a bare URL,
// then copy) — the same fallback chain as ShareButton's Instagram path and
// SaveStarPanel's keepsake save, duplicated here since neither exports its
// internals. Keep ShareButton for the small bond rows; this panel is for
// sharing your own star.

const DEFAULT_SHARE_TEXT = "A thought on The Between — what do you know is true but can't prove?";

export interface SharePanelProps {
  shortcode: string;
  star: Pick<CosmosStarData, 'text' | 'dimensions' | 'shortcode'>;
  questionText?: string;
  onClose: () => void;
}

type VideoState = 'composing' | 'ready' | 'unavailable';

// Social share URL builders — mirrors ShareButton.tsx's buildShareUrl (not
// exported there, so duplicated here rather than reaching into that module).
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

type ActionState = 'idle' | 'working' | 'notready';

export default function SharePanel({ shortcode, star, questionText, onClose }: SharePanelProps) {
  const url = `https://${SITE_URL}/s/${shortcode}`;
  const posterUrl = `/api/story/${shortcode}/poster`;
  const mp4Url = `/api/story/${shortcode}`;
  const shareText = questionText
    ? `A thought on The Between — ${questionText}`
    : DEFAULT_SHARE_TEXT;

  const [videoState, setVideoState] = useState<VideoState>('composing');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<ActionState>('idle');
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Fetch the MP4. One attempt only — on a non-OK response (the 503 the
  // route sends on encode failure, JSON body with a poster fallback URL) we
  // settle into 'unavailable' for good; no retry-loop.
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

  // Background prefetch of the poster as a File — kept ready so the Share
  // button's fallback branch never has to `await fetch` between the click
  // and `navigator.share`, which would risk losing user-activation.
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

  // Revoke the video blob URL on unmount.
  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [videoUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (shareState !== 'notready') return;
    const t = setTimeout(() => setShareState('idle'), 4200);
    return () => clearTimeout(t);
  }, [shareState]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      urlInputRef.current?.select();
    }
  }, [url]);

  // Share chain: first capable branch wins — video file, then poster file,
  // then a bare URL share, then copy-with-feedback. A cancelled share sheet
  // is a quiet dismissal, not an error — it does not fall through further.
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

  const handleSaveVideo = useCallback(() => {
    if (!videoUrl || shareState === 'working') return;
    setShareState('working');
    try {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `the-between-${shortcode}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setShareState('idle');
    } catch {
      setShareState('notready');
    }
  }, [videoUrl, shortcode, shareState]);

  const handlePlatform = useCallback(async (id: string) => {
    if (id === 'instagram') {
      if (posterFile && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [posterFile] })) {
        try {
          await navigator.share({ files: [posterFile] });
          return;
        } catch { /* fall through to the URL scheme */ }
      }
      window.location.href =
        'instagram-stories://share?backgroundTopColor=%231E1840&backgroundBottomColor=%23A06880';
      return;
    }
    window.open(buildShareUrl(id, url, shareText), '_blank', 'noopener,noreferrer,width=600,height=500');
  }, [posterFile, url, shareText]);

  const composing = videoState === 'composing';

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
        animation: 'btwSharePanelFade .3s ease',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="btw-share-panel-cap"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          overflowY: 'auto',
          background: 'rgba(20,14,40,0.86)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.14)}`,
          borderRadius: 18,
          color: BTW.textPri,
          padding: '26px 24px 24px',
          textAlign: 'center',
          animation: 'btwShareRise .38s cubic-bezier(.2,.8,.3,1)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 10, right: 12,
            background: 'transparent', border: 'none',
            color: withAlpha(BTW.textPri, 0.55), fontSize: 22, cursor: 'pointer',
            lineHeight: 1, padding: 8, zIndex: 1,
          }}
        >
          ×
        </button>

        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
          color: BTW.textDim, marginBottom: 14, letterSpacing: '0.01em',
        }}>
          your star&rsquo;s story
        </div>

        {/* The preview — the centerpiece. Height-driven 9:16 box so it fits
            the viewport with room left for the actions below. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div
            className="btw-share-preview-cap"
            style={{
              position: 'relative',
              alignSelf: 'center',
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
              alt="A preview of your star's story"
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
                  padding: '0 16px 20px',
                  background: 'linear-gradient(180deg, transparent 40%, rgba(14,10,32,0.55) 100%)',
                }}
              >
                <div className="btw-share-shimmer" />
                <div style={{
                  fontFamily: SERIF, fontStyle: 'italic', fontSize: 14,
                  color: withAlpha(BTW.textPri, 0.85), textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                }}>
                  composing your star&rsquo;s story…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The words, so it's unmistakable what is being shared. */}
        <div style={{
          fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
          fontSize: 14, lineHeight: 1.5, color: BTW.textSec,
          marginBottom: 20, padding: '0 6px',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          &ldquo;{star.text}&rdquo;
        </div>

        {/* Primary — Share */}
        <button
          onClick={handleShare}
          style={{
            width: '100%',
            background: 'rgba(240,232,224,0.05)',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.65)}`,
            color: BTW.horizon[3],
            padding: '15px 20px',
            borderRadius: 14,
            fontFamily: SANS, fontSize: 14, fontWeight: 500,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'background .2s ease',
            touchAction: 'manipulation',
            marginBottom: 10,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.12); }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.05)'; }}
        >
          Share ↗
        </button>

        {/* Save video — hidden until the MP4 is ready */}
        {videoState === 'ready' && (
          <button
            onClick={handleSaveVideo}
            style={{
              width: '100%',
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.textPri, 0.22)}`,
              color: BTW.textDim,
              padding: '13px 20px',
              borderRadius: 14,
              fontFamily: SANS, fontSize: 12.5, fontWeight: 500,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color .2s ease, border-color .2s ease',
              marginBottom: 10,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.4); }}
            onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.22); }}
          >
            Save video ↓
          </button>
        )}

        {/* Copy link */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
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
              fontFamily: SANS, fontSize: 12,
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

        {/* Secondary — quiet platform row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
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
                transition: 'color .2s, border-color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.6); }}
              onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.16); }}
            >
              <Icon />
            </button>
          ))}
        </div>

        <div style={{
          minHeight: 18, marginTop: 10,
          fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
          color: BTW.textDim, opacity: shareState === 'notready' ? 1 : 0,
          transition: 'opacity .3s ease',
        }}>
          still forming — try again in a moment
        </div>
      </div>
      <style>{`
        @keyframes btwSharePanelFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes btwShareRise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btwShareShimmerSweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        .btw-share-panel-cap { max-height: 92vh; max-height: 92dvh; }
        .btw-share-preview-cap { height: min(44vh, 400px); height: min(44dvh, 400px); }
        .btw-share-shimmer {
          position: absolute; inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .btw-share-shimmer::after {
          content: '';
          position: absolute; top: 0; bottom: 0; left: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent, rgba(240,232,224,0.08), transparent);
          animation: btwShareShimmerSweep 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
