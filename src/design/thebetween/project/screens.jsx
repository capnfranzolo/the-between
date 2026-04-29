// The five screens of The Between
// Each is a self-contained interactive prototype.
// Shared chrome (status bar, etc.) is intentionally absent — these are
// device-frameless artboards designed for handoff.

const SERIF = `'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif`;
const SANS  = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

// ─── Screen 1: Landing / Question ─────────────────────────────
// Mobile-first: 390 × 844 (iPhone-ish proportions).
function LandingScreen({ onSubmit }) {
  const [text, setText] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const ready = text.trim().length >= 20;
  const tooLong = text.length > 500;
  const counterColor = tooLong ? '#F0B878' :
    text.length >= 20 ? BTW.textPri : BTW.textDim;

  return (
    <div style={{
      position: 'relative',
      width: '100%', height: '100%',
      overflow: 'hidden',
      fontFamily: SANS,
      color: BTW.textPri,
    }}>
      <TwilightSky>
        <AmbientField count={4} seedBase="landing-amb" maxSize={120} />
        <Terrain height={120} layers={3} />
      </TwilightSky>

      {/* Content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '0 28px',
        textAlign: 'center',
        zIndex: 2,
      }}>
        {/* eyebrow */}
        <div style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.textDim,
          marginBottom: 36,
        }}>
          The Between
        </div>

        {/* Question — each line forced single-line, no rebalancing */}
        <h1 style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 32, lineHeight: 1.18,
          margin: 0, color: BTW.textPri,
          maxWidth: 360,
          letterSpacing: '0.005em',
          textShadow: '0 1px 24px rgba(30,24,64,0.6)',
        }}>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>What do you know is true</span>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>but you can't prove?</span>
        </h1>

        {/* Input area */}
        <div style={{ width: '100%', maxWidth: 340, marginTop: 44 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, 600))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Write what you know…"
            rows={4}
            style={{
              width: '100%',
              background: 'rgba(240,232,224,0.06)',
              border: `1px solid ${focused ? withAlpha(BTW.textPri, 0.35) : withAlpha(BTW.textPri, 0.15)}`,
              borderRadius: 14,
              color: BTW.textPri,
              fontFamily: SERIF,
              fontSize: 19,
              lineHeight: 1.5,
              padding: '16px 18px',
              outline: 'none',
              resize: 'none',
              transition: 'border-color .4s ease, background .4s ease',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginTop: 12,
            fontSize: 12, fontFamily: SANS,
            color: counterColor,
            letterSpacing: '0.04em',
            transition: 'color .3s',
          }}>
            <span style={{ opacity: text.length > 0 ? 1 : 0, transition: 'opacity .3s' }}>
              {text.length < 20 ? `${20 - text.length} more to bloom` : 'ready'}
            </span>
            <span>{text.length} / 500</span>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={() => ready && !tooLong && onSubmit(text.trim())}
          disabled={!ready || tooLong}
          style={{
            marginTop: 28,
            opacity: ready && !tooLong ? 1 : 0,
            transform: ready && !tooLong ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity .6s ease, transform .6s ease',
            pointerEvents: ready && !tooLong ? 'auto' : 'none',
            background: 'transparent',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
            color: BTW.horizon[3],
            padding: '14px 32px',
            borderRadius: 999,
            fontFamily: SANS,
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            cursor: ready && !tooLong ? 'pointer' : 'default',
            backdropFilter: 'blur(6px)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14);
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          See your shape →
        </button>
      </div>
    </div>
  );
}

// ─── Screen 1b: Unique fact (gates entry to the cosmos) ──────
// Quieter, lower-stakes than the main question. Shorter prompt,
// shorter answer; no minimum length, but cap at ~120 chars.
function UniqueScreen({ onSubmit, onBack }) {
  const [text, setText] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const tooLong = text.length > 120;
  const ready = text.trim().length >= 3 && !tooLong;

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden', fontFamily: SANS, color: BTW.textPri,
    }}>
      <TwilightSky>
        <AmbientField count={3} seedBase="unique-amb" maxSize={90} />
        <Terrain height={110} layers={3} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '0 28px', textAlign: 'center', zIndex: 2,
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: BTW.horizon[3],
          opacity: 0.85, marginBottom: 28,
        }}>
          One more thing
        </div>

        <h1 style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 30, lineHeight: 1.22,
          margin: 0, color: BTW.textPri,
          maxWidth: 360,
          textShadow: '0 1px 24px rgba(30,24,64,0.6)',
        }}>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>What's something</span>
          <span style={{ display: 'block', whiteSpace: 'nowrap' }}>unique about you?</span>
        </h1>

        <div style={{
          marginTop: 14, fontSize: 13, color: BTW.textDim,
          maxWidth: 280, lineHeight: 1.5,
        }}>
          A small detail. Strangers will see this beside your star.
        </div>

        <div style={{ width: '100%', maxWidth: 340, marginTop: 36 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, 140))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="I collect rainwater… / I hum without noticing… "
            rows={2}
            style={{
              width: '100%',
              background: 'rgba(240,232,224,0.06)',
              border: `1px solid ${focused ? withAlpha(BTW.textPri, 0.35) : withAlpha(BTW.textPri, 0.15)}`,
              borderRadius: 14, color: BTW.textPri,
              fontFamily: SERIF, fontSize: 17, lineHeight: 1.5,
              padding: '14px 16px', outline: 'none', resize: 'none',
              transition: 'border-color .4s ease, background .4s ease',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginTop: 10,
            fontSize: 12, color: tooLong ? '#F0B878' : BTW.textDim,
            letterSpacing: '0.04em',
          }}>
            <span style={{ opacity: text.length ? 1 : 0, transition: 'opacity .3s' }}>
              {tooLong ? 'a little shorter' : 'optional, but specific helps'}
            </span>
            <span>{text.length} / 120</span>
          </div>
        </div>

        <div style={{
          marginTop: 28, display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: 'none',
              color: BTW.textDim, fontFamily: SANS, fontSize: 12,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: 'pointer', padding: '14px 8px',
            }}
          >
            ← back
          </button>
          <button
            onClick={() => ready && onSubmit(text.trim())}
            disabled={!ready}
            style={{
              opacity: ready ? 1 : 0.4,
              transition: 'opacity .4s ease, background .3s ease',
              pointerEvents: ready ? 'auto' : 'none',
              background: 'transparent',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
              color: BTW.horizon[3],
              padding: '14px 28px', borderRadius: 999,
              fontFamily: SANS, fontSize: 13, fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              cursor: ready ? 'pointer' : 'default',
              backdropFilter: 'blur(6px)',
            }}
            onMouseEnter={e => {
              if (ready) e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.14);
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Enter the cosmos →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 2: Reveal ────────────────────────────────────────
// Mobile-first: 390 × 844. Spirograph blooms, then short URL + 3 actions.
function RevealScreen({ answer = "I think people remember the weather of a moment more than the words.", shortId = '7kx2', onAction }) {
  const [stage, setStage] = React.useState('blooming'); // blooming → revealed → confirmed
  const [confirmation, setConfirmation] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const warmth = (hashString(answer) % 100) / 100;

  React.useEffect(() => {
    const t = setTimeout(() => setStage('revealed'), 2200);
    return () => clearTimeout(t);
  }, []);

  const url = `thebetween.world/s/${shortId}`;

  const handleAction = (kind) => {
    if (kind === 'keep') {
      setConfirmation('kept');
    } else if (kind === 'share') {
      navigator.clipboard?.writeText('https://' + url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (kind === 'cosmos') {
      onAction?.('cosmos');
    }
  };

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden', fontFamily: SANS, color: BTW.textPri,
    }}>
      <TwilightSky>
        <AmbientField count={3} seedBase="reveal-amb" maxSize={90} />
        <Terrain height={100} layers={3} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px 32px',
        zIndex: 2,
        textAlign: 'center',
      }}>
        {/* echoed answer (top) — upright serif, larger */}
        <div style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: 19, lineHeight: 1.45,
          color: BTW.textPri, opacity: stage === 'blooming' ? 0 : 0.95,
          maxWidth: 320, margin: '0 0 28px',
          transition: 'opacity 1.2s ease 0.2s',
          textWrap: 'pretty',
        }}>
          “{answer}”
        </div>

        {/* Spirograph (animated bloom) */}
        <div style={{
          marginBottom: 28,
          transform: stage === 'blooming' ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 2.2s cubic-bezier(.2,.7,.3,1)',
        }}>
          <Spirograph
            seed={answer}
            size={130}
            warmth={warmth}
            bloomMs={2200}
            animate
          />
        </div>

        {/* Short URL */}
        <div style={{
          opacity: stage === 'revealed' ? 1 : 0,
          transform: stage === 'revealed' ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .8s ease 0.3s, transform .8s ease 0.3s',
          marginBottom: 26,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.32em', textTransform: 'uppercase',
            color: BTW.textDim, marginBottom: 8,
          }}>
            your star lives here
          </div>
          <div style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 17, color: BTW.textPri,
            padding: '10px 16px',
            border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`,
            borderRadius: 8,
            background: 'rgba(240,232,224,0.04)',
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}>
            {url}
            <span style={{
              fontSize: 10, color: copied ? BTW.horizon[3] : BTW.textDim,
              letterSpacing: '0.2em', transition: 'color .3s',
            }}>
              {copied ? 'COPIED' : ''}
            </span>
          </div>
        </div>

        {/* Three paths */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          width: '100%', maxWidth: 320,
          opacity: stage === 'revealed' && !confirmation ? 1 : 0,
          transform: stage === 'revealed' ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity .8s ease 0.6s, transform .8s ease 0.6s',
          pointerEvents: confirmation ? 'none' : 'auto',
        }}>
          {/* "Keep it" is the default — your star already exists at the URL above.
              Only two real choices: share with someone you trust, or enter the cosmos. */}
          <PathCard
            tone="warm"
            label="Share it"
            sub="Send your URL to someone you trust."
            onClick={() => handleAction('share')}
          />
          <PathCard
            tone="bright"
            label="Enter the cosmos"
            sub="Let strangers see your shape."
            onClick={() => handleAction('cosmos')}
          />
        </div>

        {/* Keep confirmation overlay */}
        {confirmation === 'kept' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,24,64,0.55)',
            backdropFilter: 'blur(8px)',
            animation: 'btwFade .4s ease',
          }}
          onClick={() => setConfirmation(null)}>
            <div style={{
              maxWidth: 280, textAlign: 'center', padding: 24,
            }}>
              <div style={{
                fontFamily: SERIF, fontSize: 26, lineHeight: 1.3,
                color: BTW.textPri, marginBottom: 14,
              }}>
                Your star is kept.
              </div>
              <div style={{ fontSize: 15, color: BTW.textSec, lineHeight: 1.55 }}>
                Bookmark <span style={{ color: BTW.textPri, fontFamily: 'monospace' }}>{url}</span> — it will be here when you return.
              </div>
              <button onClick={() => setConfirmation(null)} style={{
                marginTop: 22, background: 'transparent',
                border: `1px solid ${withAlpha(BTW.textPri, 0.35)}`,
                color: BTW.textPri, padding: '8px 20px', borderRadius: 999,
                fontSize: 11, fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                cursor: 'pointer', fontFamily: SANS,
              }}>
                Tap to close
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes btwFade {from {opacity:0} to {opacity:1}}`}</style>
    </div>
  );
}

function PathCard({ label, sub, onClick, tone = 'quiet' }) {
  const [hover, setHover] = React.useState(false);
  const accent =
    tone === 'bright' ? BTW.horizon[3] :
    tone === 'warm' ? BTW.horizon[1] :
    BTW.textPri;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left',
        background: hover ? withAlpha(accent, 0.08) : 'rgba(240,232,224,0.03)',
        border: `1px solid ${withAlpha(accent, hover ? 0.5 : 0.2)}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all .3s ease',
        fontFamily: SANS,
        color: BTW.textPri,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{
        fontSize: 16, fontWeight: 500, letterSpacing: '0.01em',
        color: accent, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: BTW.textDim, lineHeight: 1.45 }}>
        {sub}
      </div>
    </button>
  );
}

// ─── Screen 3: Cosmos (with binary connections rendered in-place) ───
// Desktop landscape: 1280 × 760
// Each thought is a star. Stars can have multiple binary bonds to other
// stars; bonds are rendered as soft glowing curves. Hover a star to see
// its quote; hover a bond (or a star with bonds) to see the connection
// reasons. Selecting your own star + clicking another star + writing a
// reason creates a new bond.

const COSMOS_THOUGHTS = [
  { id: '7kx2', text: "I think people remember the weather of a moment more than the words.", x: 0.50, y: 0.50, depth: 0, warmth: 0.62 },
  { id: 'a3pm', text: "Grief is just love with no place to land.",                            x: 0.20, y: 0.42, depth: 0, warmth: 0.85 },
  { id: 'q9wn', text: "The body knows things the mind hasn't admitted yet.",                  x: 0.80, y: 0.40, depth: 0, warmth: 0.30 },
  { id: 'b4tx', text: "Most cruelty is fear in a costume.",                                   x: 0.36, y: 0.62, depth: 1, warmth: 0.18 },
  { id: 'm7vc', text: "We become the voices we were spoken to with as children.",             x: 0.66, y: 0.64, depth: 1, warmth: 0.72 },
  { id: 'h2ka', text: "The most honest thing about a person is what bores them.",             x: 0.10, y: 0.66, depth: 1, warmth: 0.45 },
  { id: 'r5jn', text: "There is a version of you that only exists when a particular person is in the room.", x: 0.90, y: 0.58, depth: 1, warmth: 0.55 },
  { id: 'c8dz', text: "Some places remember you longer than you remember them.",              x: 0.46, y: 0.30, depth: 2, warmth: 0.20 },
  { id: 's1fp', text: "We forgive people for what we want forgiven in ourselves.",            x: 0.27, y: 0.20, depth: 2, warmth: 0.78 },
  { id: 'w6gh', text: "Love is mostly attention, repeated.",                                  x: 0.71, y: 0.22, depth: 2, warmth: 0.92 },
  { id: 'n4bb', text: "Every adult is a child still listening for footsteps.",                x: 0.58, y: 0.18, depth: 2, warmth: 0.38 },
  { id: 'p2lq', text: "What we call intuition is grief that learned to speak softly.",        x: 0.06, y: 0.30, depth: 2, warmth: 0.50 },
];

// Pre-existing bonds the user discovers when entering the cosmos.
// Each bond: {a, b, reason}. Multiple bonds per star are allowed — that's
// the whole point: a star can be in many binary systems at once.
const COSMOS_BONDS = [
  { a: 'a3pm', b: '7kx2', reason: "Because they're both about the things we carry without knowing." },
  { a: '7kx2', b: 'c8dz', reason: "What stays of a place is mostly its weather." },
  { a: 'm7vc', b: 'r5jn', reason: "We are made of the rooms we've been in." },
  { a: 'q9wn', b: 'p2lq', reason: "The mind is slow to admit what the body and grief already know." },
  { a: 'b4tx', b: 'h2ka', reason: "Both ask: what is a person really trying to hide?" },
  { a: 'a3pm', b: 's1fp', reason: "Forgiveness and grief are the same shape from different sides." },
  { a: 'w6gh', b: 'n4bb', reason: "Both say: love is mostly listening." },
];

function ThoughtLine({ t }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline',
    }}>
      <div style={{
        flexShrink: 0,
        width: 6, height: 6, borderRadius: '50%',
        background: BTW.horizon[3],
        boxShadow: `0 0 6px ${BTW.horizon[3]}`,
        transform: 'translateY(-1px)',
      }} />
      <div style={{
        fontFamily: SERIF, fontSize: 13, lineHeight: 1.45,
        color: BTW.textSec, textWrap: 'pretty',
      }}>
        “{t.text}”
      </div>
    </div>
  );
}

function CosmosScreen({ myThought, onConnect, initialBonds = COSMOS_BONDS, initialSelected = null }) {
  const [hovered, setHovered] = React.useState(null);   // id or null
  const [hoveredBond, setHoveredBond] = React.useState(null); // {bond, x, y} or null
  const [selected, setSelected] = React.useState(initialSelected); // pinned id
  const [connecting, setConnecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [bonds, setBonds] = React.useState(initialBonds);

  // Insert "my" thought, filtering out duplicates by id
  const allThoughts = React.useMemo(() => {
    if (!myThought) return COSMOS_THOUGHTS;
    const filtered = COSMOS_THOUGHTS.filter(t => t.id !== myThought.id);
    return [
      ...filtered,
      { ...myThought, depth: 0, x: myThought.x ?? 0.50, y: myThought.y ?? 0.48, mine: true },
    ];
  }, [myThought]);

  const byId = React.useMemo(() => {
    const m = {};
    allThoughts.forEach(t => { m[t.id] = t; });
    return m;
  }, [allThoughts]);

  const active = hovered || selected;
  const activeT = active ? byId[active] : null;

  // Bonds touching the active star
  const activeBonds = React.useMemo(() => {
    if (!active) return [];
    return bonds.filter(bo => bo.a === active || bo.b === active);
  }, [bonds, active]);

  // Depth → visual props
  const depthProps = (d) => {
    if (d === 0) return { size: 92, blur: 0, opacity: 1.0 };
    if (d === 1) return { size: 60, blur: 1.2, opacity: 0.88 };
    return { size: 30, blur: 4, opacity: 0.65 };
  };

  const submitConnect = (targetId) => {
    if (!myThought || reason.trim().length < 4) return;
    const newBond = { a: myThought.id, b: targetId, reason: reason.trim() };
    setBonds(b => [...b, newBond]);
    setReason('');
    setConnecting(false);
    setSelected(targetId);
    onConnect?.(newBond);
  };

  // Pixel positions in viewBox terms (for SVG paths).
  // We render bonds in an absolute SVG that fills the cosmos.
  const VBW = 1280, VBH = 760;
  const px = (t) => ({ x: t.x * VBW, y: t.y * VBH });

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden', fontFamily: SANS, color: BTW.textPri,
    }}>
      <TwilightSky>
        <AmbientField count={6} seedBase="cosmos-bg" maxSize={50} />
        <Terrain height={140} />
      </TwilightSky>

      {/* Bond curves — rendered in SVG behind stars. Active bonds glow. */}
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
      >
        <defs>
          <filter id="bondGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {bonds.map((bo, i) => {
          const A = byId[bo.a], B = byId[bo.b];
          if (!A || !B) return null;
          const a = px(A), b = px(B);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 28; // gentle arc up
          // Bonds react ONLY to bond hover, never to star hover/selection.
          // Star hover affects the star overlay; bond hover affects the bond overlay.
          const isBondHover = hoveredBond && hoveredBond.idx === i;
          const dimmed = hoveredBond && !isBondHover;
          const lit = isBondHover;
          const stroke = lit ? BTW.horizon[3] : withAlpha(BTW.textPri, 0.55);
          const handleEnter = () => {
            // store midpoint in viewBox units → render tooltip via %
            setHoveredBond({
              idx: i, bond: bo,
              xPct: (mx / VBW) * 100,
              yPct: (my / VBH) * 100,
            });
          };
          return (
            <g key={i} opacity={dimmed ? 0.12 : (lit ? 0.95 : 0.45)}>
              {/* soft glow underlay for active bonds */}
              {lit && (
                <path
                  d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={BTW.horizon[3]}
                  strokeWidth="6"
                  filter="url(#bondGlow)"
                  opacity="0.5"
                />
              )}
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={lit ? 1.4 : 0.9}
                strokeDasharray={lit ? "0" : "3 6"}
              />
              {/* invisible fat hit-line for hover */}
              <path
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                style={{ pointerEvents: 'stroke', cursor: 'help' }}
                onMouseEnter={handleEnter}
                onMouseLeave={() => setHoveredBond(null)}
              />
            </g>
          );
        })}
      </svg>

      {/* Bond hover tooltip — shows the connection reason + the linked thought */}
      {hoveredBond && (() => {
        const bo = hoveredBond.bond;
        const A = byId[bo.a], B = byId[bo.b];
        if (!A || !B) return null;
        return (
          <div
            style={{
              position: 'absolute',
              left: `${hoveredBond.xPct}%`,
              top: `${hoveredBond.yPct}%`,
              transform: 'translate(-50%, calc(-100% - 14px))',
              maxWidth: 320, minWidth: 220,
              padding: '14px 16px',
              background: 'rgba(20, 16, 36, 0.92)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${withAlpha(BTW.horizon[3], 0.45)}`,
              borderRadius: 14,
              color: BTW.textPri,
              zIndex: 5,
              pointerEvents: 'none',
              boxShadow: `0 12px 40px ${withAlpha(BTW.horizon[3], 0.25)}`,
              animation: 'btwRise .25s cubic-bezier(.2,.7,.3,1)',
            }}
          >
            <div style={{
              fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
              color: BTW.horizon[3], opacity: 0.9, marginBottom: 8,
            }}>
              bond
            </div>
            <div style={{
              fontFamily: SERIF, fontSize: 17, lineHeight: 1.4,
              color: BTW.textPri, textWrap: 'pretty',
            }}>
              “{bo.reason}”
            </div>
            <div style={{
              marginTop: 10, paddingTop: 10,
              borderTop: `1px solid ${withAlpha(BTW.textPri, 0.12)}`,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <ThoughtLine t={A} />
              <ThoughtLine t={B} />
            </div>
          </div>
        );
      })()}

      {/* Background click clears selection */}
      <div
        onClick={() => { setSelected(null); setConnecting(false); setReason(''); }}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

      {/* Stars */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
        {allThoughts.map(t => {
          const dp = depthProps(t.depth);
          const isHov = hovered === t.id;
          const isSel = selected === t.id;
          const isActive = isHov || isSel;
          const dimmed = active && !isActive;
          const bondCount = bonds.filter(b => b.a === t.id || b.b === t.id).length;
          return (
            <div
              key={t.id}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(t.id);
                setConnecting(false);
                setReason('');
              }}
              style={{
                position: 'absolute',
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${isActive ? 1.18 : 1})`,
                opacity: dp.opacity * (dimmed ? 0.5 : 1),
                transition: 'transform .7s cubic-bezier(.2,.7,.3,1), opacity .5s',
                cursor: 'pointer',
                filter: isActive ? 'drop-shadow(0 0 22px rgba(240,200,120,0.45))' : undefined,
              }}
            >
              <Spirograph
                seed={t.id + ':' + t.text}
                size={dp.size}
                warmth={t.warmth}
                blur={isActive ? 0 : dp.blur}
                speedMul={t.depth === 0 ? 1 : 0.5}
              />
              {t.mine && (
                <div style={{
                  position: 'absolute', top: -22, left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
                  color: BTW.horizon[3],
                  textShadow: '0 0 10px rgba(240,200,120,0.6)',
                  whiteSpace: 'nowrap',
                }}>
                  yours
                </div>
              )}
              {/* bond count label removed — the dotted lines speak for themselves */}
            </div>
          );
        })}
      </div>

      {/* Top chrome */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '22px 30px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 5, pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 12, letterSpacing: '0.34em', textTransform: 'uppercase',
          color: BTW.textDim, fontFamily: SANS,
        }}>
          The Between · cosmos
        </div>
        <div style={{
          fontSize: 12, color: BTW.textDim, fontFamily: SANS, letterSpacing: '0.1em',
        }}>
          {allThoughts.length} stars · {bonds.length} bonds
        </div>
      </div>

      {/* Hint when nothing active */}
      {!active && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 28,
          transform: 'translateX(-50%)',
          fontFamily: SANS, fontSize: 13, color: BTW.textDim,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          zIndex: 4, pointerEvents: 'none',
        }}>
          hover a star to read it · click to pin
        </div>
      )}

      {/* Hover/Selection card — quote + bonds */}
      {activeT && !connecting && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setHovered(activeT.id)}
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
            animation: 'btwRise .45s cubic-bezier(.2,.7,.3,1)',
          }}
        >
          {/* quote */}
          <div style={{
            fontFamily: SERIF, fontWeight: 400,
            fontSize: 24, lineHeight: 1.4,
            color: BTW.textPri, textWrap: 'pretty',
          }}>
            “{activeT.text}”
          </div>

          {/* unique fact (the second answer, shown in a different treatment) */}
          {activeT.unique && (
            <div style={{
              marginTop: 16,
              paddingLeft: 14,
              borderLeft: `2px solid ${withAlpha(BTW.horizon[3], 0.55)}`,
              fontFamily: SANS, fontSize: 14, fontWeight: 400,
              lineHeight: 1.45, color: BTW.textSec,
              letterSpacing: '0.01em',
            }}>
              <span style={{
                display: 'block',
                fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
                color: BTW.horizon[3], opacity: 0.8, marginBottom: 4,
              }}>something unique</span>
              {activeT.unique}
            </div>
          )}

          {/* Action row */}
          <div style={{
            marginTop: 18, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: 16,
          }}>
            <button
              type="button"
              title={`Share /s/${activeT.id}`}
              aria-label="Share this star"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(`btw.app/s/${activeT.id}`);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '50%',
                background: 'transparent',
                border: `1px solid ${withAlpha(BTW.textPri, 0.18)}`,
                color: BTW.textDim, cursor: 'pointer',
                transition: 'color .2s, border-color .2s, background .2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = BTW.textPri;
                e.currentTarget.style.borderColor = withAlpha(BTW.horizon[3], 0.7);
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = BTW.textDim;
                e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.18);
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            {myThought && !activeT.mine && (
              <button
                onClick={() => setConnecting(true)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${withAlpha(BTW.horizon[3], 0.7)}`,
                  color: BTW.horizon[3],
                  padding: '10px 18px', borderRadius: 999,
                  fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                  textTransform: 'uppercase', whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  fontFamily: SANS,
                }}
                onMouseEnter={e => e.currentTarget.style.background = withAlpha(BTW.horizon[3], 0.15)}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Connect your star to this →
              </button>
            )}
            {activeT.mine && (
              <div style={{
                fontSize: 12, color: BTW.horizon[3], letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}>
                your star
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connect input drawer */}
      {connecting && activeT && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '50%', bottom: 28,
            transform: 'translateX(-50%)',
            width: 'min(640px, 88%)',
            background: 'rgba(20,14,40,0.78)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.4)}`,
            borderRadius: 18,
            padding: '22px 26px',
            color: BTW.textPri,
            zIndex: 7,
          }}
        >
          <div style={{
            fontFamily: SERIF, fontSize: 20, color: BTW.textPri, marginBottom: 14,
          }}>
            Why do these belong together?
          </div>
          <input
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, 100))}
            autoFocus
            placeholder="Because they're both about…"
            onKeyDown={e => e.key === 'Enter' && submitConnect(activeT.id)}
            style={{
              width: '100%',
              background: 'rgba(240,232,224,0.06)',
              border: `1px solid ${withAlpha(BTW.textPri, 0.25)}`,
              borderRadius: 12,
              color: BTW.textPri,
              fontFamily: SERIF,
              fontSize: 19,
              padding: '14px 16px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginTop: 14, gap: 12,
          }}>
            <div style={{ fontSize: 12, color: BTW.textDim, letterSpacing: '0.1em' }}>
              {reason.length}/100
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setConnecting(false); setReason(''); }} style={{
                background: 'transparent',
                border: `1px solid ${withAlpha(BTW.textPri, 0.2)}`,
                color: BTW.textDim, padding: '10px 18px', borderRadius: 999,
                fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                cursor: 'pointer', fontFamily: SANS,
              }}>Cancel</button>
              <button onClick={() => submitConnect(activeT.id)} disabled={reason.trim().length < 4} style={{
                background: reason.trim().length >= 4 ? withAlpha(BTW.horizon[3], 0.22) : 'transparent',
                border: `1px solid ${withAlpha(BTW.horizon[3], reason.trim().length >= 4 ? 0.7 : 0.25)}`,
                color: BTW.horizon[3],
                padding: '10px 20px', borderRadius: 999,
                fontSize: 12, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                cursor: reason.trim().length >= 4 ? 'pointer' : 'default',
                fontFamily: SANS, transition: 'all .3s',
              }}>Bind them</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes btwRise {
          from {opacity:0; transform: translateX(-50%) translateY(20px)}
          to {opacity:1; transform: translateX(-50%) translateY(0)}
        }
      `}</style>
    </div>
  );
}

// ─── Screen 5: Share Preview (1200 × 630 OG card) ───────────
function SharePreviewScreen({
  question = "What do you know is true that you can't prove?",
  spirographSeed = "I think people remember the weather of a moment more than the words.",
  warmth = 0.62,
}) {
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      overflow: 'hidden', fontFamily: SANS, color: BTW.textPri,
    }}>
      <TwilightSky>
        <AmbientField count={3} seedBase="og-bg" maxSize={70} />
        <Terrain height={120} layers={3} />
      </TwilightSky>

      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        alignItems: 'center', padding: '0 80px',
      }}>
        {/* Left: question + CTA */}
        <div>
          <div style={{
            fontSize: 15, letterSpacing: '0.36em', textTransform: 'uppercase',
            color: BTW.horizon[3], marginBottom: 30,
          }}>
            The Between
          </div>
          <h1 style={{
            fontFamily: SERIF, fontWeight: 400,
            fontSize: 60, lineHeight: 1.1, margin: 0,
            color: BTW.textPri, textWrap: 'pretty', maxWidth: 460,
            textShadow: '0 2px 28px rgba(30,24,64,0.6)',
          }}>
            {question}
          </h1>
          <div style={{
            marginTop: 36,
            display: 'inline-flex', alignItems: 'center', gap: 14,
            padding: '14px 22px',
            border: `1px solid ${withAlpha(BTW.horizon[3], 0.6)}`,
            borderRadius: 999,
            color: BTW.horizon[3],
            fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: BTW.horizon[3], boxShadow: `0 0 10px ${BTW.horizon[3]}` }} />
            Your thoughts connect us
          </div>
          <div style={{
            marginTop: 22, fontFamily: 'monospace', fontSize: 14,
            color: BTW.textDim, letterSpacing: '0.1em',
          }}>
            thebetween.world
          </div>
        </div>

        {/* Right: spirograph */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Spirograph seed={spirographSeed} size={210} warmth={warmth} />
        </div>
      </div>

      {/* OG dimensions label, subtle */}
      <div style={{
        position: 'absolute', top: 16, right: 24, zIndex: 3,
        fontSize: 9, color: BTW.textDim, letterSpacing: '0.18em',
        fontFamily: 'monospace',
      }}>
        1200 × 630 · og:image
      </div>
    </div>
  );
}

Object.assign(window, {
  LandingScreen, RevealScreen, CosmosScreen, SharePreviewScreen,
});
