'use client';
import { useState } from 'react';
import { BTW, SERIF, SANS, withAlpha } from '@/lib/btw';
import TwilightSky from '@/components/TwilightSky';
import Terrain from '@/components/Terrain';
import AdminQueue from '@/components/AdminQueue';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [pendingStars] = useState([
    { id: 'mock-1', shortcode: 'xq3p', answer: 'People are fundamentally trying their best, even when they fail spectacularly.', created_at: new Date().toISOString(), status: 'pending' as const },
    { id: 'mock-2', shortcode: 'mn7t', answer: 'The moments right before sleep are when we are most honest with ourselves.', created_at: new Date().toISOString(), status: 'pending' as const },
  ]);
  const [pendingConnections] = useState([
    { id: 'conn-1', from_star_id: 'a3pm', to_star_id: '7kx2', reason: "Both speak to what we carry without knowing.", created_at: new Date().toISOString(), status: 'pending' as const },
  ]);

  const handleAuth = async () => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthed(true);
      } else {
        setError('Incorrect password.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setChecking(false);
    }
  };

  const handleAction = async (type: 'star' | 'connection', id: string, action: 'approve' | 'reject', edit?: string) => {
    await fetch('/api/admin/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, action, edit }),
    });
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', fontFamily: SANS, color: BTW.textPri }}>
      <TwilightSky style={{ position: 'fixed' }}>
        <Terrain height={100} />
      </TwilightSky>

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh' }}>
        {/* Header */}
        <div style={{
          padding: '24px 30px 20px',
          borderBottom: `1px solid ${withAlpha(BTW.textPri, 0.1)}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: BTW.textDim }}>
            The Between · Admin
          </div>
          {authed && (
            <div style={{ fontSize: 11, color: BTW.horizon[3], letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              ● authenticated
            </div>
          )}
        </div>

        {!authed ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 'calc(100vh - 72px)',
            padding: '0 28px', textAlign: 'center',
          }}>
            <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: BTW.textPri, marginBottom: 32 }}>
              Admin Access
            </h1>
            <div style={{ width: '100%', maxWidth: 300 }}>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAuth(); }}
                placeholder="Password"
                style={{
                  width: '100%',
                  background: 'rgba(240,232,224,0.06)',
                  border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`,
                  borderRadius: 10, color: BTW.textPri,
                  fontSize: 16, padding: '12px 16px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {error && <div style={{ color: '#F0B878', fontSize: 13, marginTop: 8 }}>{error}</div>}
              <button
                onClick={handleAuth}
                disabled={checking}
                style={{
                  marginTop: 16, width: '100%',
                  background: 'transparent',
                  border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
                  color: BTW.horizon[3], padding: '12px 24px', borderRadius: 999,
                  fontFamily: SANS, fontSize: 13, fontWeight: 500,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {checking ? 'Checking…' : 'Enter →'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '32px 0 80px' }}>
            <AdminQueue
              pendingStars={pendingStars}
              pendingConnections={pendingConnections}
              onAction={handleAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}
