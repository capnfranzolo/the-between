'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createSpirograph, withSeed } from '@/lib/spirograph/renderer';
import CosmosScene, {
  type ThoughtData, type BondData, type CosmosSceneHandle, type CamMode,
  CROSSFADE_IN_MS,
} from '@/components/cosmos/CosmosScene';
import StarDetail, { type CosmosStarData } from '@/components/StarDetail';
import ConnectionDrawer from '@/components/ConnectionDrawer';
import AboutModal from '@/components/AboutModal';
import AddToHomeScreen from '@/components/AddToHomeScreen';
import SkyRail from '@/components/SkyRail';
import SoundControl from '@/components/SoundControl';
import LivenessCounter from '@/components/LivenessCounter';
import ShareButton from '@/components/ShareButton';
import QuestionCycler, { type ValidatedPayload } from '@/components/QuestionCycler';
import UniqueOverlay from '@/components/UniqueOverlay';
import { getAtmosphere } from '@/lib/atmosphere';
import { type CosmosBond } from '@/components/BondCurves';
import { BTW, SANS, SERIF, mulberry32, hashString, withAlpha } from '@/lib/btw';
import { sound } from '@/lib/sound';
import { SITE_URL, BIRTH_FLAG_KEY } from '@/lib/constants';

const DIM_DEFAULTS = { certainty: 0.5, warmth: 0.5, tension: 0.5, vulnerability: 0.5, scope: 0.5, rootedness: 0.5, emotionIndex: 3, curveType: 'hypotrochoid' as const, reasoning: '' };

interface CosmosData {
  question: { id: string; text: string } | null;
  stars: CosmosStarData[];
  bonds: CosmosBond[];
  totals?: { thoughts: number; bonds: number };
}

function starWorldPos(shortcode: string): { x: number; y: number; z: number } {
  const rand = mulberry32(hashString(shortcode));
  const x = (rand() - 0.5) * 1000;
  const z = (rand() - 0.5) * 1000;
  const y = 80 + rand() * 60;
  return { x, y, z };
}

const PENDING_BOND_KEY = (starId: string) => `btw_pending_bond_${starId}`;

// A pending (optimistically-shown, not-yet-confirmed) outgoing bond for the
// visitor's own star in this world, if any — read on initial load and again
// on every world switch (each question has its own bond, if any).
function pendingBondFor(stars: CosmosStarData[], myShortcode: string | null): CosmosBond[] {
  if (!myShortcode) return [];
  const myStarId = stars.find(s => s.shortcode === myShortcode)?.id;
  if (!myStarId) return [];
  const raw = localStorage.getItem(PENDING_BOND_KEY(myStarId));
  if (!raw) return [];
  try {
    const b = JSON.parse(raw) as { id?: string; fromStarId: string; toStarId: string; reason: string };
    return [{ id: b.id ?? ('pending-' + b.fromStarId), from_id: b.fromStarId, to_id: b.toStarId, reason: b.reason }];
  } catch {
    return [];
  }
}

// ── Shared inline star canvas with circular clip + hover smoke ────────────────
function ensureSmokeCSSInline() {
  const SMOKE_STYLE_ID = 'btw-smoke-css';
  if (typeof document === 'undefined' || document.getElementById(SMOKE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = SMOKE_STYLE_ID;
  s.textContent = `
    @keyframes btwSmokeRise {
      0%   { opacity:0;    transform: translate(-50%,-100%) translateY(0px); }
      30%  { opacity:0.85; }
      100% { opacity:0.85; transform: translate(-50%,-100%) translateY(-24px); }
    }
    @keyframes btwSmokeSplit {
      0%   { opacity:0.85; transform: translate(0,0) scale(1);   filter:blur(0px); }
      100% { opacity:0;    transform: translate(var(--btw-sdx),var(--btw-sdy)) scale(0.65); filter:blur(6px); }
    }
  `;
  document.head.appendChild(s);
}

// Spirograph geometry (outerRadius=120 * zoom=1.4) needs ~400+ px canvas to render
// the full pattern. We render at SPIRO_RENDER_SIZE then CSS-scale down to `size`.
const SPIRO_RENDER_SIZE = 600;

function showSmokeFromEl(
  wrapEl: HTMLElement,
  text: string,
): { timers: ReturnType<typeof setTimeout>[]; bubble: HTMLDivElement } {
  ensureSmokeCSSInline();
  const bubble = document.createElement('div');
  // Use setProperty so inherited values (text-transform, font-*) are overridden
  const props: [string, string][] = [
    ['position', 'absolute'],
    ['left', '50%'],
    ['bottom', 'calc(100% + 6px)'],
    ['text-align', 'center'],
    // Explicit width so the bubble isn't constrained to the 40px containing block
    ['width', '200px'],
    ['max-width', '220px'],
    ['pointer-events', 'none'],
    ['font-family', "'Cormorant Garamond','Playfair Display',Georgia,serif"],
    ['font-style', 'italic'],
    ['font-weight', '300'],
    ['font-size', '17px'],
    ['line-height', '1.65'],
    ['color', 'rgba(240,232,224,0.82)'],
    ['text-shadow', '0 0 18px rgba(240,200,150,0.22)'],
    ['letter-spacing', '0.02em'],
    ['text-transform', 'none'],
    ['opacity', '0'],
    ['animation', 'btwSmokeRise 2s ease-out forwards'],
    ['z-index', '99'],
  ];
  props.forEach(([p, v]) => bubble.style.setProperty(p, v));

  const words = text.trim().split(/\s+/).filter(Boolean);
  const spans: HTMLSpanElement[] = [];
  words.forEach(w => {
    const span = document.createElement('span');
    span.textContent = w + ' ';
    span.style.setProperty('display', 'inline');
    bubble.appendChild(span);
    spans.push(span);
  });

  wrapEl.appendChild(bubble);

  const t1 = setTimeout(() => {
    if (!wrapEl.contains(bubble)) return;
    bubble.style.setProperty('animation', 'none');
    bubble.style.setProperty('opacity', '0.85');
    bubble.style.setProperty('transform', 'translate(-50%, -100%) translateY(-24px)');
    spans.forEach((span, i) => {
      const ang  = Math.random() * Math.PI * 2;
      const dist = 35 + Math.random() * 55;
      span.style.setProperty('--btw-sdx', `${(Math.cos(ang) * dist).toFixed(0)}px`);
      span.style.setProperty('--btw-sdy', `${(Math.sin(ang) * dist - 35).toFixed(0)}px`);
      span.style.setProperty('animation', `btwSmokeSplit 1.2s ease-out ${(i * 30 + Math.random() * 40).toFixed(0)}ms forwards`);
    });
  }, 1300);
  const t2 = setTimeout(() => { bubble.remove(); }, 2600);

  return { timers: [t1, t2], bubble };
}

function StarMiniInline({ star, size }: { star: CosmosStarData; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const smokeTimers  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const smokeBubble  = useRef<HTMLDivElement | null>(null);
  const dims = withSeed(star.dimensions ?? DIM_DEFAULTS, star.shortcode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Render at full geometry size, then CSS-scale down to `size`
    const inst = createSpirograph(canvas, dims, { size: SPIRO_RENDER_SIZE, dpr: 1 });
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    let t = 0; let raf: number;
    const tick = () => { t += 0.016; inst.renderStatic(t); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); inst.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [star.id]);

  function clearSmoke() {
    smokeTimers.current.forEach(clearTimeout);
    smokeTimers.current = [];
    smokeBubble.current?.remove();
    smokeBubble.current = null;
  }

  function showSmoke() {
    if (smokeBubble.current || !star.text?.trim() || !wrapRef.current) return;
    const { timers, bubble } = showSmokeFromEl(wrapRef.current, star.text);
    smokeTimers.current = timers;
    smokeBubble.current = bubble;
  }

  useEffect(() => () => clearSmoke(), []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block', cursor: 'pointer', flexShrink: 0 }}
      onMouseEnter={showSmoke}
      onMouseLeave={clearSmoke}
    >
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  );
}


// ── Reusable ghost prompt — DOM-driven so animation state never resets ─────────
// Renders a centered fixed container; injects bubble via DOM to avoid
// React re-render fighting with CSS animation state.
function GhostPrompt({ text, onDone }: { text: string; onDone: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    ensureSmokeCSSInline();
    // Vertical-only rise (no horizontal translate — container already centers)
    const STYLE_ID = 'btw-ghost-rise-css';
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = `
        @keyframes btwGhostRise {
          0%   { opacity:0;    transform:translateY(0); }
          30%  { opacity:0.85; }
          100% { opacity:0.85; transform:translateY(-24px); }
        }
      `;
      document.head.appendChild(s);
    }

    const bubble = document.createElement('div');
    const props: [string, string][] = [
      ['font-family', "'Cormorant Garamond','Playfair Display',Georgia,serif"],
      ['font-style', 'italic'],
      ['font-weight', '300'],
      ['font-size', '20px'],
      ['line-height', '1.65'],
      ['color', 'rgba(240,232,224,0.85)'],
      ['text-shadow', '0 0 22px rgba(240,200,150,0.22)'],
      ['letter-spacing', '0.02em'],
      ['text-align', 'center'],
      ['opacity', '0'],
      ['animation', 'btwGhostRise 2s ease-out forwards'],
    ];
    props.forEach(([p, v]) => bubble.style.setProperty(p, v));

    const words = text.split(' ');
    const spans: HTMLSpanElement[] = [];
    words.forEach(w => {
      const span = document.createElement('span');
      span.textContent = w + ' ';
      span.style.display = 'inline';
      bubble.appendChild(span);
      spans.push(span);
    });
    container.appendChild(bubble);

    const t1 = setTimeout(() => {
      bubble.style.setProperty('animation', 'none');
      bubble.style.setProperty('opacity', '0.85');
      bubble.style.setProperty('transform', 'translateY(-24px)');
      spans.forEach((span, i) => {
        span.style.setProperty('display', 'inline-block');
        const ang  = Math.random() * Math.PI * 2;
        const dist = 45 + Math.random() * 80;
        span.style.setProperty('--btw-sdx', `${(Math.cos(ang) * dist).toFixed(0)}px`);
        span.style.setProperty('--btw-sdy', `${(Math.sin(ang) * dist - 40).toFixed(0)}px`);
        span.style.setProperty('animation', `btwSmokeSplit 1.2s ease-out ${(i * 40).toFixed(0)}ms forwards`);
      });
    }, 3000);
    const t2 = setTimeout(() => { bubble.remove(); onDone(); }, 4400);

    return () => { clearTimeout(t1); clearTimeout(t2); bubble.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 12,
        pointerEvents: 'none',
        width: 360,
        textAlign: 'center',
      }}
    />
  );
}

export default function CosmosPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const searchParams = useSearchParams();
  const starParam = searchParams.get('star');
  const [data, setData] = useState<CosmosData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectConfirmed, setConnectConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [localBonds, setLocalBonds] = useState<CosmosBond[]>([]);
  const [myShortcode] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('my_star') : null,
  );
  const [showAbout, setShowAbout] = useState(false);
  // Camera mode reported by the scene — drift is the default state
  const [sceneMode, setSceneMode] = useState<CamMode>('drift');
  const sceneRef = useRef<CosmosSceneHandle>(null);
  const autoFocused = useRef(false);

  // ── "Add yours" composer overlay (Phase 6 — also the defect #5 CTA target) ──
  const [showComposer, setShowComposer] = useState(false);
  const [pending, setPending] = useState<ValidatedPayload | null>(null);

  // Real connection id for the bond just formed, once /api/connect confirms —
  // lets the confirmation panel offer a real "share this pair" link.
  const [connectedBondId, setConnectedBondId] = useState<string | null>(null);

  // ── Phase 4 — sky rail: the world currently shown (may differ from the
  // route param after a rail switch; the URL is kept in sync via pushState
  // without a real navigation). ──
  const [currentQuestionId, setCurrentQuestionId] = useState(questionId);
  const [railQuestions, setRailQuestions] = useState<{ id: string; text: string; starCount: number }[]>([]);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const pendingPopRef = useRef<string | null>(null);
  // Lets the switch-completion timeout drain a queued popstate switch without
  // performSwitch referencing itself inside its own useCallback.
  const performSwitchRef = useRef<(newId: string, pushHistory: boolean) => void>(() => {});

  // Fetch all active questions (+ star counts) for the sky rail
  useEffect(() => {
    fetch('/api/questions')
      .then(r => r.json())
      .then(d => setRailQuestions(
        (d.questions ?? []).map((q: { id: string; text: string; starCount?: number }) => ({
          id: q.id, text: q.text, starCount: q.starCount ?? 0,
        })),
      ))
      .catch(() => {});
  }, []);

  // Initial load — keyed on the route param, which never changes without a
  // real navigation (the rail updates `currentQuestionId` + the URL via
  // pushState instead, see performSwitch below), so this runs exactly once.
  useEffect(() => {
    fetch(`/api/cosmos/${questionId}`)
      .then(r => r.json())
      .then((d: CosmosData) => {
        const stars = d.stars.map(s => ({
          ...s,
          text: (s as unknown as { answer?: string }).answer ?? s.text,
        }));
        setData({ ...d, stars });
        setLocalBonds(pendingBondFor(stars, myShortcode));
      })
      .catch(() => {});
  }, [questionId, myShortcode]);

  // ── Phase 4 — crossfade to a different question's world. Camera stays;
  // drift continues in the new world. Ignores same-world / mid-switch
  // requests (the rail and popstate both funnel through here). ──
  const performSwitch = useCallback((newId: string, pushHistory: boolean) => {
    if (newId === currentQuestionId || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    // Phase 7 — the ambient bed travels with the sky: start its crossfade at
    // the same moment the visual one begins.
    sound.setWorld(newId);
    setSelected(null);
    setConnecting(false);
    setConnectConfirmed(false);
    setReason('');

    fetch(`/api/cosmos/${newId}`)
      .then(r => r.json())
      .then((d: CosmosData) => {
        const stars = d.stars.map(s => ({
          ...s,
          text: (s as unknown as { answer?: string }).answer ?? s.text,
        }));
        const atmosphere = getAtmosphere(newId);
        sceneRef.current?.crossfadeToWorld(atmosphere, () => {
          setData({ ...d, stars });
          setLocalBonds(pendingBondFor(stars, myShortcode));
          setCurrentQuestionId(newId);
          if (pushHistory) window.history.pushState(null, '', `/cosmos/${newId}`);
          setTimeout(() => {
            switchingRef.current = false;
            setSwitching(false);
            const pending = pendingPopRef.current;
            pendingPopRef.current = null;
            if (pending) performSwitchRef.current(pending, false);
          }, CROSSFADE_IN_MS);
        });
      })
      .catch(() => { switchingRef.current = false; setSwitching(false); });
  }, [currentQuestionId, myShortcode]);
  useEffect(() => { performSwitchRef.current = performSwitch; }, [performSwitch]);

  // Back/forward: the rail's pushState calls only touch the URL, so browser
  // navigation between worlds needs its own listener.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/cosmos\/([^/]+)/);
      const newId = m?.[1];
      if (!newId || newId === currentQuestionId) return;
      if (switchingRef.current) { pendingPopRef.current = newId; return; }
      performSwitch(newId, false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [currentQuestionId, performSwitch]);

  // Phase 7 — keep the ambient bed pointed at the world on screen (mount, and
  // as a no-op backstop after a rail switch, which already called setWorld).
  useEffect(() => { sound.setWorld(currentQuestionId); }, [currentQuestionId]);

  // Phase 7/8 — a star was just born: submitting navigates here, so the moment
  // arrives across a document boundary as a sessionStorage flag. The camera is
  // already on its way (the ?star= autofocus below); the scene holds the star
  // at nothing until it arrives, then blooms it and plays the birth sound on
  // that same frame.
  const birthConsumed = useRef(false);
  const [bornShortcode, setBornShortcode] = useState<string | null>(null);
  useEffect(() => {
    if (birthConsumed.current || !data) return;
    let born: string | null = null;
    try { born = sessionStorage.getItem(BIRTH_FLAG_KEY); } catch { /* private mode */ }
    if (!born) return;
    birthConsumed.current = true;
    try { sessionStorage.removeItem(BIRTH_FLAG_KEY); } catch { /* private mode */ }
    if (starParam && born !== starParam) return; // stale flag from another star
    const bornStar = data.stars.find(s => s.shortcode === born);
    if (!bornStar) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consumes the one-shot birth flag once cosmos data arrives; ref-guarded
    setBornShortcode(born);
    sceneRef.current?.bloomStar(bornStar.id);
  }, [data, starParam]);

  const allStars = useMemo(() => data?.stars ?? [], [data]);

  const bonds = useMemo(() => {
    const serverBonds = data?.bonds ?? [];
    // Once /api/connect confirms, the same bond exists both server-side (after
    // a refetch) and in localBonds (the optimistic copy, now carrying the real
    // id — see handleConnect). Drop the local copy so it isn't listed twice.
    const serverIds = new Set(serverBonds.map(b => b.id));
    const serverPairs = new Set(serverBonds.map(b => `${b.from_id}|${b.to_id}`));
    const extra = localBonds.filter(b => !serverIds.has(b.id) && !serverPairs.has(`${b.from_id}|${b.to_id}`));
    return [...serverBonds, ...extra];
  }, [data, localBonds]);

  const thoughts = useMemo<ThoughtData[]>(() => {
    if (!allStars.length) return [];
    const positions = new Map<string, { x: number; y: number; z: number }>();
    for (const star of allStars) {
      positions.set(star.id, starWorldPos(star.shortcode));
    }
    // Put the user's own star first so it's always within the baked-spirograph cap
    const myId = myShortcode ? allStars.find(s => s.shortcode === myShortcode)?.id : undefined;
    const sorted = myId
      ? [...allStars].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0))
      : allStars;
    return sorted.map(star => {
      // withSeed: the shortcode drives the Phase 5 structural archetype.
      const dims = withSeed(star.dimensions ?? DIM_DEFAULTS, star.shortcode);
      return {
        id: star.id,
        ...positions.get(star.id)!,
        emotionIndex: dims.emotionIndex,
        dimensions: dims,
        answer: star.text ?? '',
        uniqueFact: star.unique_fact ?? '',
      };
    });
  }, [allStars, myShortcode]);

  const byId = useMemo(() => {
    const m: Record<string, CosmosStarData> = {};
    allStars.forEach(s => { m[s.id] = s; });
    return m;
  }, [allStars]);

  const userStarId = useMemo(() => {
    if (!myShortcode) return null;
    return data?.stars.find(s => s.shortcode === myShortcode)?.id ?? null;
  }, [myShortcode, data]);

  const selectedStar = useMemo(() => {
    if (!selected) return null;
    const star = byId[selected];
    if (!star) return null;
    return userStarId ? { ...star, mine: star.id === userStarId } : star;
  }, [selected, byId, userStarId]);

  const sceneBonds = useMemo<BondData[]>(
    () => bonds.map(b => ({ id: b.id, from_id: b.from_id, to_id: b.to_id, reason: b.reason })),
    [bonds],
  );

  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    return bonds
      .filter(b => b.from_id === selected || b.to_id === selected)
      // Local/pending ids ("local-…", "pending-…") aren't real connection
      // rows yet — the OG endpoint can't render them, so skip the share link.
      .map(b => ({
        id: b.id.startsWith('local-') || b.id.startsWith('pending-') ? undefined : b.id,
        reason: b.reason,
        relatedStarId: b.from_id === selected ? b.to_id : b.from_id,
      }));
  }, [selected, bonds]);

  // The star the visitor's own star orbits, if it already orbits one — the
  // difference between "already orbits another" and "orbits this one" (#9).
  const myBondTargetId = useMemo(() => {
    if (!userStarId) return null;
    return bonds.find(b => b.from_id === userStarId)?.to_id ?? null;
  }, [userStarId, bonds]);

  const userHasOutgoingBond = useMemo(() => {
    if (!userStarId) return false;
    if (bonds.some(b => b.from_id === userStarId)) return true;
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(PENDING_BOND_KEY(userStarId));
  }, [userStarId, bonds]);

  const handleThoughtClick = (id: string) => {
    sound.play('select');
    setSelected(id);
    setConnecting(false);
    setConnectConfirmed(false);
    setConnectedBondId(null);
    setReason('');
    sceneRef.current?.flyToThought(id);
  };

  const handleConnect = async (targetId: string) => {
    if (!userStarId || reason.trim().length < 4) return;
    const savedReason = reason.trim();
    const tempId = 'local-' + Date.now();
    const newBond: CosmosBond = {
      id: tempId,
      from_id: userStarId,
      to_id: targetId,
      reason: savedReason,
    };

    setLocalBonds(b => [...b, newBond]);
    setReason('');
    setConnecting(false);
    setConnectConfirmed(true);
    setConnectedBondId(null);
    sound.play('bond'); // the finale — fires with the confirmation, not the round trip
    // …and the sky performs it: both stars bloom, and the reason is written
    // once along the orbit they now share.
    sceneRef.current?.bondFinale(userStarId, targetId, savedReason);

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStarId: userStarId,
          toStarId: targetId,
          reason: savedReason,
          questionId: currentQuestionId,
        }),
      });
      const payload = await res.json();
      if (payload.ok) {
        const realId: string = payload.connection?.id ?? tempId;
        // Swap the optimistic temp id for the real one so "share this pair"
        // (here and on any future visit to either star's panel) points at a
        // working /b/[connectionId] + OG image.
        setLocalBonds(b => b.map(bd => bd.id === tempId ? { ...bd, id: realId } : bd));
        setConnectedBondId(realId);
        localStorage.setItem(PENDING_BOND_KEY(userStarId), JSON.stringify({
          id: realId, fromStarId: userStarId, toStarId: targetId, reason: savedReason,
        }));
      }
    } catch { /* bond already shown optimistically */ }
  };

  const initialShortcode = starParam ?? myShortcode;

  // Auto-focus initial star (from ?star= param or user's own star) when cosmos first loads
  useEffect(() => {
    if (!autoFocused.current && data) {
      const initialStarId = initialShortcode
        ? data.stars.find(s => s.shortcode === initialShortcode)?.id ?? null
        : null;
      if (initialStarId) {
        autoFocused.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-focuses a star once cosmos data arrives; ref-guarded to run once
        setSelected(initialStarId);
        setTimeout(() => sceneRef.current?.flyToThought(initialStarId), 80);
      }
    }
  }, [initialShortcode, data]);

  const clearSelection = () => {
    setSelected(null);
    setConnecting(false);
    setConnectConfirmed(false);
    setConnectedBondId(null);
    setReason('');
  };

  const closeComposer = useCallback(() => {
    setShowComposer(false);
    setPending(null);
  }, []);

  useEffect(() => {
    if (!showComposer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeComposer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showComposer, closeComposer]);

  return (
    <>
      <CosmosScene
        ref={sceneRef}
        thoughts={thoughts}
        bonds={sceneBonds}
        activeStar={selected}
        userStar={userStarId}
        onThoughtClick={handleThoughtClick}
        onBackgroundClick={clearSelection}
        onModeChange={setSceneMode}
        initialAtmosphere={getAtmosphere(questionId)}
      />

      <SkyRail
        questions={railQuestions}
        currentId={currentQuestionId}
        onSelect={id => performSwitch(id, true)}
        disabled={switching}
      />

      <SoundControl />

      {data?.totals && (
        <LivenessCounter thoughts={data.totals.thoughts} bonds={data.totals.bonds} />
      )}

      <div
        style={{
          position: 'relative', zIndex: 1, height: '100vh', overflow: 'hidden',
          fontFamily: SANS, color: BTW.textPri, pointerEvents: 'none',
        }}
      >
        {/* Top chrome — the question, quiet */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '22px 30px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          pointerEvents: 'none',
        }}>
          {data?.question?.text && (
            <div style={{
              fontFamily: SERIF, fontStyle: 'italic',
              fontSize: 'clamp(22px, 3.2vw, 36px)',
              color: BTW.textPri,
              letterSpacing: '0.01em',
              textAlign: 'center',
              maxWidth: 900,
              lineHeight: 1.2,
              opacity: 0.35,
              pointerEvents: 'none',
            }}>
              {data.question.text}
            </div>
          )}
        </div>

        {/* Star detail panel */}
        {selectedStar && !connecting && !connectConfirmed && (
          <StarDetail
            star={selectedStar}
            hasMystar={!!userStarId}
            userHasOutgoingBond={userHasOutgoingBond}
            onConnect={() => setConnecting(true)}
            connections={selectedConnections}
            onConnectionClick={handleThoughtClick}
            onDismiss={clearSelection}
            nudge={hashString(selectedStar.shortcode) % 5 === 0}
            userStar={userStarId && byId[userStarId] && !selectedStar.mine
              ? { text: byId[userStarId].text, shortcode: byId[userStarId].shortcode, dimensions: byId[userStarId].dimensions }
              : null}
            onAnswerCTA={!userStarId ? () => setShowComposer(true) : undefined}
            justBorn={!!bornShortcode && selectedStar.shortcode === bornShortcode}
            isBondTarget={!!myBondTargetId && selectedStar.id === myBondTargetId}
          />
        )}

        {/* Connection confirmation */}
        {connectConfirmed && selectedStar && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '50%', bottom: 28,
              transform: 'translateX(-50%)',
              width: 'min(520px, 90%)',
              background: 'rgba(20,14,40,0.78)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${BTW.horizon[3]}44`,
              borderRadius: 18,
              padding: '28px 32px',
              textAlign: 'center',
              zIndex: 6,
              pointerEvents: 'auto',
              animation: 'btwRise .45s cubic-bezier(.2,.7,.3,1)',
            }}
          >
            <div style={{ fontFamily: SERIF, fontSize: 20, color: BTW.textPri, lineHeight: 1.4 }}>
              Your stars are bound.
            </div>
            {connectedBondId && (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: BTW.textDim }}>
                  share this pair
                </span>
                <ShareButton
                  url={`https://${SITE_URL}/b/${connectedBondId}`}
                  ogImageUrl={`https://${SITE_URL}/api/og/bond/${connectedBondId}`}
                  shareText="Two strangers' thoughts, bound on The Between"
                />
              </div>
            )}
            <button
              onClick={clearSelection}
              style={{
                marginTop: 22, background: 'transparent',
                border: `1px solid ${BTW.textPri}44`,
                color: BTW.textDim,
                fontFamily: SANS, fontSize: 11, letterSpacing: '0.18em',
                textTransform: 'uppercase', cursor: 'pointer',
                padding: '10px 20px', borderRadius: 999,
              }}
            >
              continue exploring
            </button>
          </div>
        )}

        {/* Connection drawer */}
        {connecting && selectedStar && (
          <ConnectionDrawer
            reason={reason}
            onChange={setReason}
            onCancel={() => { setConnecting(false); setReason(''); }}
            onSubmit={() => handleConnect(selectedStar.id)}
            userStar={userStarId && byId[userStarId]
              ? { text: byId[userStarId].text, shortcode: byId[userStarId].shortcode, dimensions: byId[userStarId].dimensions }
              : null}
            targetStar={{
              text: selectedStar.text,
              shortcode: selectedStar.shortcode,
              dimensions: selectedStar.dimensions,
            }}
          />
        )}

        <style>{`
          @keyframes btwRise {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
          /* Desktop: next-question floats upper-right, mobile version hidden */
          .btw-next-q-desktop {
            position: absolute;
            top: calc(env(safe-area-inset-top, 0px) + 24px);
            right: 20px;
          }
          .btw-next-q-mobile { display: none !important; }

          /* Mobile: width breakpoint OR touch-only device */
          @media (max-width: 768px), (hover: none) and (pointer: coarse) {
            .btw-next-q-desktop { display: none !important; }
            .btw-next-q-mobile  { display: block !important; }
          }
        `}</style>
      </div>

      {/* ── Bottom chrome — outside overflow:hidden overlay so it's never
          clipped on iOS. zIndex:0 keeps it above the canvas but below the
          overlay div (zIndex:1) which contains StarDetail (zIndex:6 within
          that context). StarDetail therefore always paints on top. ── */}
      <div style={{
        position: 'fixed',
        left: 0, right: 0,
        bottom: 0,
        height: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 24px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        zIndex: 0,
        pointerEvents: 'none',
      }}>
        {/* Brand + user's star to the right (hidden when viewing own star) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setShowAbout(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase',
              color: BTW.textDim, padding: '6px 0',
              minHeight: 44,
              transition: 'color .2s',
              fontFamily: SANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
            onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
          >
            The Between
          </button>
          {userStarId && byId[userStarId] && !selected && !userHasOutgoingBond && (
            <StarMiniInline star={byId[userStarId]} size={80} />
          )}
        </div>

        {/* Drift pause/play — reflects and controls the camera's drift state */}
        {!selected && (
          <button
            onClick={() => sceneRef.current?.setDrifting(sceneMode !== 'drift')}
            aria-label={sceneMode === 'drift' ? 'Pause drift' : 'Resume drift'}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent',
              border: '1px solid rgba(240,232,224,0.14)',
              borderRadius: 999,
              padding: '8px 16px',
              minHeight: 36,
              color: BTW.textDim,
              fontFamily: SANS, fontSize: 10,
              letterSpacing: '0.24em', textTransform: 'uppercase',
              cursor: 'pointer', pointerEvents: 'auto',
              touchAction: 'manipulation',
              transition: 'color .2s, border-color .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.32)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.14)'; }}
          >
            <span aria-hidden style={{ fontSize: 9, letterSpacing: 0 }}>
              {sceneMode === 'drift' ? '❚❚' : '▶'}
            </span>
            drift
          </button>
        )}

        {/* Add star */}
        <button
          onClick={() => setShowComposer(true)}
          title="Add your thought"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(240,232,224,0.07)',
            border: '1px solid rgba(240,232,224,0.18)',
            color: BTW.textDim, fontSize: 22,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s, border-color .2s',
            pointerEvents: 'auto',
            touchAction: 'manipulation',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.14)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.07)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.18)'; }}
        >
          +
        </button>
      </div>

      {connecting && (
        <GhostPrompt
          key="connect-mode"
          text="Find a star to orbit."
          onDone={() => {/* stays until connecting changes */}}
        />
      )}

      <AddToHomeScreen />

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* "Add yours" — frosted overlay over the still-visible, still-drifting
          sky. Also the Phase 6 / defect #5 CTA target for shared-link
          visitors with no star of their own in this cosmos. */}
      {showComposer && !pending && (
        <div
          onClick={closeComposer}
          style={{
            position: 'fixed', inset: 0, zIndex: 20,
            background: 'rgba(20,14,40,0.5)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'clamp(16px, 5vw, 40px)',
            animation: 'btwComposerFade .3s ease',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 'min(720px, 92vw)', position: 'relative' }}
          >
            <button
              onClick={closeComposer}
              aria-label="Close"
              style={{
                position: 'absolute', top: -40, right: 0,
                background: 'transparent', border: 'none',
                color: withAlpha(BTW.textPri, 0.6), fontSize: 26, cursor: 'pointer',
                lineHeight: 1, padding: 8,
              }}
            >
              ×
            </button>
            <QuestionCycler
              onValidated={setPending}
              initialQuestionId={currentQuestionId}
            />
          </div>
          <style>{`@keyframes btwComposerFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
      )}

      {pending && (
        <UniqueOverlay
          answer={pending.answer}
          questionId={pending.questionId}
          dimensions={pending.dimensions}
          onBack={() => setPending(null)}
        />
      )}
</>
  );
}
