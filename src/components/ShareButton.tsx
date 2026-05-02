'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BTW, SERIF, withAlpha } from '@/lib/btw';

interface ShareButtonProps {
  url: string;
  style?: React.CSSProperties;
  nudge?: boolean;
}

// Social share URL builders
function buildShareUrl(platform: string, url: string): string {
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent("A thought on The Between — what do you know is true but can't prove?");
  switch (platform) {
    case 'facebook':  return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
    case 'x':         return `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`;
    case 'snapchat':  return `https://www.snapchat.com/scan?attachmentUrl=${encoded}`;
    default:          return url;
  }
}

// ── Icons ────────────────────────────────────────────────────────────────────

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

const LinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const CheckIcon = () => (
  <span style={{ fontSize: 13, fontWeight: 600 }}>✓</span>
);

// ── Component ────────────────────────────────────────────────────────────────

// Tray dimensions — keep in sync with rendered size
// 5 items × 36px + 4 gaps × 4px + 8px top + 8px bottom padding ≈ 212px
const TRAY_WIDTH  = 164;
const TRAY_HEIGHT = 216;

export default function ShareButton({ url, style, nudge }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [nudgePhase, setNudgePhase] = useState<'visible' | 'fading' | 'gone'>('gone');

  useEffect(() => {
    if (!nudge) return;
    setNudgePhase('visible');
    const fadeTimer = setTimeout(() => setNudgePhase('fading'), 3000);
    const goneTimer = setTimeout(() => setNudgePhase('gone'), 3500);
    return () => { clearTimeout(fadeTimer); clearTimeout(goneTimer); };
  }, [nudge]);
  // Fixed coordinates for the tray (set when opening)
  const [trayPos, setTrayPos] = useState<{ top: number; left: number } | null>(null);

  const openTray = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Position tray above the trigger, right-aligned
    const top  = rect.top - TRAY_HEIGHT - 10;
    const left = rect.right - TRAY_WIDTH;
    setTrayPos({ top: Math.max(8, top), left: Math.max(8, left) });
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const tray = document.getElementById('btw-share-tray');
      if (
        tray && !tray.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleItem = async (id: string) => {
    if (id === 'link') {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => { setCopied(false); }, 2000);
      } catch { /* ignore */ }
      return; // keep tray open for feedback
    }

    if (id === 'instagram') {
      // Instagram has no web share URL — use native share sheet, else copy
      if (typeof navigator !== 'undefined' && navigator.share) {
        try { await navigator.share({ url, title: 'A thought on The Between' }); } catch { /* cancelled */ }
      } else {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => { setCopied(false); }, 2000);
        } catch { /* ignore */ }
      }
    } else {
      window.open(buildShareUrl(id, url), '_blank', 'noopener,noreferrer,width=600,height=500');
    }
    setOpen(false);
  };

  const items: Array<{ id: string; label: string; Icon: () => React.ReactElement }> = [
    { id: 'facebook',  label: 'Facebook',          Icon: FacebookIcon },
    { id: 'instagram', label: 'Instagram',          Icon: InstagramIcon },
    { id: 'snapchat',  label: 'Snapchat',           Icon: SnapchatIcon },
    { id: 'x',         label: 'X',                  Icon: XIcon },
    { id: 'link',      label: copied ? 'Copied!' : 'Link', Icon: copied ? CheckIcon : LinkIcon },
  ];

  const iconButton = (
    <button
      ref={triggerRef}
      onClick={() => open ? setOpen(false) : openTray()}
      title="Share this star"
      aria-label="Share this star"
      aria-expanded={open}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: open ? withAlpha(BTW.horizon[3], 0.12) : 'transparent',
        border: `1px solid ${open ? withAlpha(BTW.horizon[3], 0.6) : withAlpha(BTW.textPri, 0.18)}`,
        color: open ? BTW.horizon[3] : BTW.textDim,
        cursor: 'pointer',
        transition: 'color .2s, border-color .2s, background .2s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!open) {
          e.currentTarget.style.color = BTW.textPri;
          e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.6);
        }
      }}
      onMouseLeave={e => {
        if (!open) {
          e.currentTarget.style.color = BTW.textDim;
          e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.18);
        }
      }}
    >
      <ShareIcon />
    </button>
  );

  const trayPortal = open && trayPos && typeof document !== 'undefined' && createPortal(
    <div
      id="btw-share-tray"
      style={{
        position: 'fixed',
        top: trayPos.top,
        left: trayPos.left,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'rgba(14,10,32,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${withAlpha(BTW.textPri, 0.13)}`,
        borderRadius: 14,
        padding: '8px 6px',
        zIndex: 9999,
        width: TRAY_WIDTH,
        animation: 'shareSlideUp .2s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      <style>{`
        @keyframes shareSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => handleItem(id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            color: id === 'link' && copied ? BTW.horizon[3] : BTW.textDim,
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
            width: '100%',
            textAlign: 'left',
            transition: 'background .15s, color .15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = withAlpha(BTW.textPri, 0.07);
            e.currentTarget.style.color = BTW.textPri;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = id === 'link' && copied ? BTW.horizon[3] : BTW.textDim;
          }}
        >
          <span style={{ width: 18, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <Icon />
          </span>
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );

  if (nudgePhase !== 'gone') {
    return (
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}>
        {/* Nudge pill wraps icon + expanding label */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          overflow: 'hidden',
          borderRadius: 999,
          border: `1px solid ${withAlpha(BTW.horizon[3], 0.5)}`,
          background: 'transparent',
          maxWidth: nudgePhase === 'visible' ? 120 : 34,
          transition: 'max-width .4s cubic-bezier(.2,.8,.3,1)',
        }}>
          {iconButton}
          <span style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 12,
            color: BTW.textDim,
            whiteSpace: 'nowrap',
            paddingRight: 10,
            opacity: nudgePhase === 'visible' ? 1 : 0,
            transition: 'opacity .4s ease',
            pointerEvents: 'none',
          }}>
            Share this!
          </span>
        </div>
        {trayPortal}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', ...style }}>
      {/* Trigger button */}
      {iconButton}
      {/* Tray is portalled to document.body so it escapes any transformed
          ancestor (StarDetail uses transform:translateX(-50%) which would
          otherwise break position:fixed coordinates). */}
      {trayPortal}
    </div>
  );
}
