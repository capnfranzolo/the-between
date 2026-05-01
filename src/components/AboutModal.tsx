'use client';
import { useEffect, useState, useCallback } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';

// Converts plain text with [text](url) markdown links into React nodes.
// Supports \n as paragraph breaks. Only http/https links are rendered as anchors.
function renderContent(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    const parts: React.ReactNode[] = [];
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(para)) !== null) {
      if (m.index > last) parts.push(para.slice(last, m.index));
      parts.push(
        <a
          key={m.index}
          href={m[2]}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: BTW.horizon[3], textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          {m[1]}
        </a>
      );
      last = m.index + m[0].length;
    }
    if (last < para.length) parts.push(para.slice(last));
    return (
      <p key={pi} style={{ margin: '0 0 1.2em', lineHeight: 1.7 }}>
        {parts}
      </p>
    );
  });
}

interface AboutModalProps {
  onClose: () => void;
}

export default function AboutModal({ onClose }: AboutModalProps) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/content')
      .then(r => r.json())
      .then(d => setContent(d.content ?? ''))
      .catch(() => setContent(''));
  }, []);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 20,
        background: 'rgba(10,7,26,0.78)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '28px',
        animation: 'btwFade .35s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          maxHeight: '80vh',
          background: 'rgba(18,14,40,0.92)',
          border: `1px solid ${withAlpha(BTW.textPri, 0.1)}`,
          borderRadius: 20,
          padding: '36px 40px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div style={{
          fontSize: 10, letterSpacing: '0.38em', textTransform: 'uppercase',
          color: BTW.textDim, marginBottom: 20, fontFamily: SANS,
        }}>
          The Between
        </div>

        <div style={{
          fontFamily: SERIF, fontSize: 16,
          color: BTW.textPri, opacity: 0.88,
        }}>
          {content === null ? (
            <span style={{ color: BTW.textDim, fontStyle: 'italic' }}>Loading…</span>
          ) : content.trim() === '' ? (
            <span style={{ color: BTW.textDim, fontStyle: 'italic' }}>Coming soon.</span>
          ) : (
            renderContent(content)
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 18, right: 20,
            background: 'transparent', border: 'none',
            color: BTW.textDim, fontSize: 20, cursor: 'pointer',
            lineHeight: 1, padding: 4,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <style>{`@keyframes btwFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}
