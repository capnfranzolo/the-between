'use client';
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import CosmosScene, { type ThoughtData, type BondData, type CosmosSceneHandle, CROSSFADE_IN_MS } from '@/components/cosmos/CosmosScene';
import StarDetail, { type CosmosStarData } from '@/components/StarDetail';
import ConnectionDrawer from '@/components/ConnectionDrawer';
import QuestionCycler, { type ValidatedPayload } from '@/components/QuestionCycler';
import UniqueOverlay from '@/components/UniqueOverlay';
import AboutModal from '@/components/AboutModal';
import AddToHomeScreen from '@/components/AddToHomeScreen';
import LivenessCounter from '@/components/LivenessCounter';
import SoundControl from '@/components/SoundControl';
import ShareButton from '@/components/ShareButton';
import ArrivalTitle from '@/components/ArrivalTitle';
import { getAtmosphere } from '@/lib/atmosphere';
import { type CosmosBond } from '@/lib/cosmos';
import { BTW, SANS, SERIF, mulberry32, hashString, withAlpha } from '@/lib/btw';
import { withSeed } from '@/lib/spirograph/renderer';
import { sound } from '@/lib/sound';
import { SITE_URL } from '@/lib/constants';

// The landing cosmos is always question 1 unless a specific question is
// requested (e.g. the "+" affordance on another cosmos page linking back
// here with `?question=`) — kept simple per the Phase 3 spec.
const LANDING_QUESTION_ID = '00000000-0000-4000-8000-000000000001';

// First-visit scripted intro — shown once per browser, then never again.
const INTRO_SEEN_KEY = 'btw_intro_seen';
// Legacy flag from the old welcome-modal landing; treat as "already seen".
const LEGACY_WELCOMED_KEY = 'btw_welcomed';

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

// Inner component that uses useSearchParams — must be wrapped in <Suspense>
// so Next.js can statically pre-render the shell without blocking on params.
function LandingPageInner() {
  const searchParams = useSearchParams();
  const requestedQuestionId = searchParams.get('question');
  // The landing world: an explicit ?question= wins; otherwise a RANDOM active
  // question is drawn once the list arrives, so the first question doesn't
  // absorb all the traffic and returning visitors land somewhere new.
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(requestedQuestionId);
  // Arriving via another cosmos page's "+" is an explicit intent to
  // contribute, not a fresh arrival — skip the scripted intro and go
  // straight to the composer overlay.
  const cameToContribute = !!requestedQuestionId;

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
  const sceneRef = useRef<CosmosSceneHandle>(null);

  // ── Arrival beat — the question alone over an empty sky, then it rises ──
  // Every fresh entry gets it except an explicit "+" navigation (they came
  // to type, not to arrive).
  const [arrivalDone, setArrivalDone] = useState(cameToContribute);
  const finishArrival = useCallback(() => {
    sceneRef.current?.releaseArrival();
    setArrivalDone(true);
  }, []);
  // If the question never arrives (fetch failure), never leave the sky held.
  useEffect(() => {
    if (arrivalDone) return;
    const t = setTimeout(() => { if (!data?.question?.text) finishArrival(); }, 6000);
    return () => clearTimeout(t);
  }, [arrivalDone, data?.question?.text, finishArrival]);

  // ── First-visit scripted intro ──────────────────────────────────────────
  const [introActive, setIntroActive] = useState(false);
  const [introJustFinished, setIntroJustFinished] = useState(false);
  const [veilFaded, setVeilFaded] = useState(false);
  const [introLine, setIntroLine] = useState<string | null>(null);
  const [lineVisible, setLineVisible] = useState(false);
  const [dwellCount, setDwellCount] = useState(0);

  // ── "Add yours" composer overlay ────────────────────────────────────────
  const [showComposer, setShowComposer] = useState(cameToContribute);
  const [pending, setPending] = useState<ValidatedPayload | null>(null);

  // Real connection id for the bond just formed, once /api/connect confirms —
  // lets the confirmation panel offer a real "share this pair" link.
  const [connectedBondId, setConnectedBondId] = useState<string | null>(null);

  // ── The tour (drift v2) — arrival opens the REAL focused view: panel at the
  // bottom, full live star animation, and a quiet ring counting down to the
  // next star. Waiting is drifting; clicking the ring pauses on this star. ──
  const TOUR_MS = 10000;
  const [tourPaused, setTourPaused] = useState(false);

  // ── Sky rail — the landing is a full member of the multiverse too ──
  const [railQuestions, setRailQuestions] = useState<{ id: string; text: string; starCount: number }[]>([]);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);

  useEffect(() => {
    fetch('/api/questions')
      .then(r => r.json())
      .then(d => {
        const qs = (d.questions ?? []).map((q: { id: string; text: string; starCount?: number }) => ({
          id: q.id, text: q.text, starCount: q.starCount ?? 0,
        }));
        setRailQuestions(qs);
        setCurrentQuestionId(prev =>
          prev ?? (qs.length ? qs[Math.floor(Math.random() * qs.length)].id : LANDING_QUESTION_ID));
      })
      .catch(() => setCurrentQuestionId(prev => prev ?? LANDING_QUESTION_ID));
  }, []);

  const handleDriftArrive = useCallback((id: string) => {
    setDwellCount(c => c + 1);
    // The scene already chimed for this arrival — no 'select' sound here.
    const star = data?.stars.find(st => st.id === id);
    setTourPaused(!!myShortcode && star?.shortcode === myShortcode);
    setSelected(id);
    sceneRef.current?.flyToThought(id);
  }, [data, myShortcode]);

  // Decide, once on mount, whether this browser gets the scripted intro.
  useEffect(() => {
    if (cameToContribute) return; // explicit "+" nav — never scripted
    const alreadySeen =
      localStorage.getItem(INTRO_SEEN_KEY) ||
      localStorage.getItem(LEGACY_WELCOMED_KEY) ||
      localStorage.getItem('my_star');
    if (alreadySeen) return;
    localStorage.setItem(INTRO_SEEN_KEY, '1');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR, so first-visit detection must run after hydration
    setIntroActive(true);
    // Fade the sky in on the next frame so the transition actually runs.
    const raf = requestAnimationFrame(() => setVeilFaded(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endIntro = useCallback(() => {
    setIntroActive(false);
    setIntroJustFinished(true);
    setIntroLine(null);
    setLineVisible(false);
    setVeilFaded(true);
  }, []);

  // Any deliberate input skips the intro instantly — never blocks the visitor.
  // Exception: answering the "sound?" invitation is a choice about the intro,
  // not an escape from it, so it neither skips nor consumes the listeners.
  useEffect(() => {
    if (!introActive) return;
    const remove = () => {
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('wheel', skip, true);
      window.removeEventListener('touchstart', skip, true);
    };
    function skip(e: Event) {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-btw-sound-control]')) return;
      remove();
      endIntro();
    }
    window.addEventListener('pointerdown', skip, { capture: true });
    window.addEventListener('keydown', skip, { capture: true });
    window.addEventListener('wheel', skip, { capture: true, passive: true });
    window.addEventListener('touchstart', skip, { capture: true, passive: true });
    return remove;
  }, [introActive, endIntro]);

  // Script beats 3 & 5 — layered over the existing drift-dwell presentation.
  useEffect(() => {
    if (!introActive) return;
    const questionText = data?.question?.text;
    if (dwellCount === 1 && questionText) {
      const t1 = setTimeout(() => { setIntroLine(`Strangers were asked: “${questionText}”`); setLineVisible(true); }, 1500);
      const t2 = setTimeout(() => setLineVisible(false), 1500 + 3000);
      const t3 = setTimeout(() => setIntroLine(null), 1500 + 3000 + 700);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (dwellCount >= 2) {
      const t1 = setTimeout(() => { setIntroLine('Somewhere in here is a worthy stranger.'); setLineVisible(true); }, 1500);
      const t2 = setTimeout(() => setLineVisible(false), 1500 + 3500);
      const t3 = setTimeout(() => endIntro(), 1500 + 3500 + 700);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwellCount, introActive, data?.question?.text]);

  useEffect(() => {
    // `mine` is proof of ownership (the exact shortcode), not a moderation
    // bypass — it only ever surfaces the requester's own star to themself.
    if (!currentQuestionId) return;
    const qs = myShortcode ? `?mine=${encodeURIComponent(myShortcode)}` : '';
    fetch(`/api/cosmos/${currentQuestionId}${qs}`)
      .then(r => r.json())
      .then((d: CosmosData) => {
        const stars = d.stars.map(s => ({
          ...s,
          text: (s as unknown as { answer?: string }).answer ?? s.text,
        }));
        setData({ ...d, stars });

        if (myShortcode) {
          const myStarId = stars.find(s => s.shortcode === myShortcode)?.id;
          if (myStarId) {
            const raw = localStorage.getItem(PENDING_BOND_KEY(myStarId));
            if (raw) {
              try {
                const b = JSON.parse(raw) as { id?: string; fromStarId: string; toStarId: string; reason: string };
                setLocalBonds([{
                  id: b.id ?? ('pending-' + b.fromStarId),
                  from_id: b.fromStarId,
                  to_id: b.toStarId,
                  reason: b.reason,
                }]);
              } catch { /* ignore corrupt entry */ }
            }
          }
        }
      })
      .catch(() => {});
  }, [currentQuestionId, myShortcode]);

  // Phase 7 — the landing cosmos is a world too; give the bed its voice.
  useEffect(() => { if (currentQuestionId) sound.setWorld(currentQuestionId); }, [currentQuestionId]);

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

  // Only ever set on the merged-in "mine" record (see /api/cosmos's `mine`
  // param) — an approved star fetched normally never carries a status field.
  // Until it clears the queue, the connect affordance stays hidden
  // everywhere, same as having no star at all: a not-yet-public star can
  // never author a public bond.
  const myStarPending = useMemo(() => {
    if (!userStarId) return false;
    const s = byId[userStarId]?.status;
    return !!s && s !== 'approved';
  }, [userStarId, byId]);

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
    {
      // A fresh stop restarts the countdown; your own star starts paused so
      // the birth moment is never cut short.
      const star = data?.stars.find(st => st.id === id);
      setTourPaused(!!myShortcode && star?.shortcode === myShortcode);
    }
    setSelected(id);
    setConnecting(false);
    setConnectConfirmed(false);
    setConnectedBondId(null);
    setReason('');
    sceneRef.current?.flyToThought(id);
  };

  // The countdown: one timer, restarted whenever the stop or a gating overlay
  // changes; the ring animates in CSS keyed the same way, so they stay in step.
  const tourEligible = !!selected && !connecting && !connectConfirmed && !showComposer && !showAbout && !switching;
  const tourKey = `${selected}|${connecting}|${connectConfirmed}|${showComposer}|${showAbout}|${switching}`;
  useEffect(() => {
    if (!tourEligible || tourPaused) return;
    const t = setTimeout(() => {
      setSelected(null);
      sceneRef.current?.tourNext();
    }, TOUR_MS);
    return () => clearTimeout(t);
  }, [tourKey, tourPaused, tourEligible]);

  const tourToggle = useCallback(() => {
    setTourPaused(p => {
      if (!p) return true;             // stay with this star
      setSelected(null);               // → next star, right now
      sceneRef.current?.tourNext();
      return false;
    });
  }, []);

  const clearSelection = () => {
    setSelected(null);
    setConnecting(false);
    setConnectConfirmed(false);
    setConnectedBondId(null);
    setReason('');
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
        setLocalBonds(b => b.map(bd => bd.id === tempId ? { ...bd, id: realId } : bd));
        setConnectedBondId(realId);
        localStorage.setItem(PENDING_BOND_KEY(userStarId), JSON.stringify({
          id: realId, fromStarId: userStarId, toStarId: targetId, reason: savedReason,
        }));
      }
    } catch { /* bond already shown optimistically */ }
  };

  // ── Crossfade to a different question's world (sky rail). Camera stays;
  // the tour sails to the new world's first star when the fade completes.
  // The URL keeps `/` and mirrors the world via ?question= (replaceState —
  // no history spam on the landing). ──
  const performSwitch = useCallback((newId: string) => {
    if (!currentQuestionId || newId === currentQuestionId || switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    sound.setWorld(newId);
    setSelected(null);
    setConnecting(false);
    setConnectConfirmed(false);
    setConnectedBondId(null);
    setReason('');

    const qs = myShortcode ? `?mine=${encodeURIComponent(myShortcode)}` : '';
    fetch(`/api/cosmos/${newId}${qs}`)
      .then(r => r.json())
      .then((d: CosmosData) => {
        const stars = d.stars.map(st => ({
          ...st,
          text: (st as unknown as { answer?: string }).answer ?? st.text,
        }));
        const atmosphere = getAtmosphere(newId);
        sceneRef.current?.crossfadeToWorld(atmosphere, () => {
          setData({ ...d, stars });
          setLocalBonds([]);
          if (myShortcode) {
            const myStarId = stars.find(st => st.shortcode === myShortcode)?.id;
            if (myStarId) {
              const raw = localStorage.getItem(PENDING_BOND_KEY(myStarId));
              if (raw) {
                try {
                  const b = JSON.parse(raw) as { id?: string; fromStarId: string; toStarId: string; reason: string };
                  setLocalBonds([{ id: b.id ?? ('pending-' + b.fromStarId), from_id: b.fromStarId, to_id: b.toStarId, reason: b.reason }]);
                } catch { /* ignore corrupt entry */ }
              }
            }
          }
          setCurrentQuestionId(newId);
          window.history.replaceState(null, '', `/?question=${newId}`);
          setTimeout(() => {
            switchingRef.current = false;
            setSwitching(false);
            // New world — the tour sails to its first star right away.
            sceneRef.current?.tourNext();
          }, CROSSFADE_IN_MS);
        });
      })
      .catch(() => { switchingRef.current = false; setSwitching(false); });
  }, [currentQuestionId, myShortcode]);

  const nextQuestion = useCallback(() => {
    if (!currentQuestionId || railQuestions.length < 2) return;
    const idx = railQuestions.findIndex(q => q.id === currentQuestionId);
    performSwitch(railQuestions[(idx + 1) % railQuestions.length].id);
  }, [currentQuestionId, railQuestions, performSwitch]);

  // "Add yours" — small "+" always available; grows into a labeled
  // invitation once the visitor has seen ~3 thoughts (or the scripted
  // intro's final line has fully faded, whichever comes first).
  const invitationUnlocked = introJustFinished || dwellCount >= 3;

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
      {currentQuestionId && (
        <CosmosScene
          ref={sceneRef}
          thoughts={thoughts}
          bonds={sceneBonds}
          activeStar={selected}
          userStar={userStarId}
          onThoughtClick={handleThoughtClick}
          onBackgroundClick={clearSelection}
          onDriftArrive={handleDriftArrive}
          initialAtmosphere={getAtmosphere(currentQuestionId)}
          arrivalHold={!cameToContribute}
        />
      )}

      {!arrivalDone && data?.question?.text && (
        <ArrivalTitle
          text={data.question.text}
          onRelease={() => sceneRef.current?.releaseArrival()}
          onDone={() => setArrivalDone(true)}
        />
      )}

      <SoundControl />

      {data?.totals && (
        <LivenessCounter thoughts={data.totals.thoughts} bonds={data.totals.bonds} />
      )}

      {/* Sky fades in over the already-gliding drift — first-visit only */}
      {introActive && (
        <div
          aria-hidden
          style={{
            position: 'fixed', inset: 0, zIndex: 15,
            background: BTW.sky[0],
            opacity: veilFaded ? 0 : 1,
            transition: 'opacity 1.2s ease',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Scripted intro lines — layered over the existing drift-dwell text */}
      {introLine && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '50%', top: '22%',
            transform: 'translateX(-50%)',
            width: 'min(560px, calc(100vw - 48px))',
            textAlign: 'center',
            zIndex: 8,
            pointerEvents: 'none',
            opacity: lineVisible ? 1 : 0,
            transition: 'opacity 0.7s ease',
          }}
        >
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 'clamp(19px, 3.4vw, 25px)',
            lineHeight: 1.5,
            color: BTW.textPri,
            textShadow: '0 1px 24px rgba(10,6,24,0.85), 0 0 8px rgba(10,6,24,0.6)',
            letterSpacing: '0.01em',
          }}>
            {introLine}
          </div>
        </div>
      )}

      <div
        style={{
          position: 'relative', zIndex: 1, height: '100vh', overflow: 'hidden',
          fontFamily: SANS, color: BTW.textPri, pointerEvents: 'none',
        }}
      >
        {/* Top chrome — the question, quiet (the arrival card lands here),
            with a small lozenge to travel to the next world. */}
        {arrivalDone && data?.question?.text && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '22px 30px 18px',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            flexWrap: 'wrap', columnGap: 16, rowGap: 8,
            pointerEvents: 'none',
          }}>
            <div style={{
              fontFamily: SERIF, fontStyle: 'italic',
              fontSize: 'clamp(22px, 3.2vw, 36px)',
              color: BTW.textPri,
              letterSpacing: '0.01em',
              textAlign: 'center',
              maxWidth: 900,
              lineHeight: 1.2,
              opacity: 0.35,
            }}>
              {data.question.text}
            </div>
            {railQuestions.length > 1 && (
              <button
                onClick={nextQuestion}
                disabled={switching}
                aria-label="Travel to the next question's sky"
                style={{
                  background: 'transparent',
                  border: `1px solid ${withAlpha(BTW.textPri, 0.16)}`,
                  borderRadius: 999,
                  color: BTW.textDim,
                  padding: '5px 12px',
                  fontFamily: SANS, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  cursor: switching ? 'default' : 'pointer',
                  opacity: switching ? 0.4 : 0.8,
                  pointerEvents: 'auto',
                  touchAction: 'manipulation',
                  transition: 'color .2s, border-color .2s, opacity .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.34); }}
                onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; e.currentTarget.style.borderColor = withAlpha(BTW.textPri, 0.16); }}
              >
                next question →
              </button>
            )}
          </div>
        )}

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
            isBondTarget={!!myBondTargetId && selectedStar.id === myBondTargetId}
            pendingRise={!!selectedStar.mine && !!selectedStar.status && selectedStar.status !== 'approved'}
            myStarPending={myStarPending}
            tour={{
              running: tourEligible && !tourPaused,
              paused: tourPaused,
              durationMs: TOUR_MS,
              restartKey: tourKey,
              onToggle: tourToggle,
            }}
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
                  ariaLabel="Share this pair"
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
        `}</style>
      </div>

      {/* ── Bottom chrome ── */}
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
        <button
          onClick={() => setShowAbout(true)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase',
            color: BTW.textDim, padding: '6px 0',
            minHeight: 44,
            transition: 'color .2s',
            fontFamily: SANS,
            pointerEvents: 'auto',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = BTW.textPri; }}
          onMouseLeave={e => { e.currentTarget.style.color = BTW.textDim; }}
        >
          The Between
        </button>

        {/* Add yours — a bare "+" until unlocked, then a labeled invitation */}
        <button
          onClick={() => setShowComposer(true)}
          title="Add your thought"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 44,
            borderRadius: 999,
            background: 'rgba(240,232,224,0.07)',
            border: '1px solid rgba(240,232,224,0.18)',
            color: BTW.textDim,
            padding: invitationUnlocked ? '0 18px 0 20px' : 0,
            width: invitationUnlocked ? 'auto' : 44,
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background .2s, border-color .2s, width .4s ease, padding .4s ease',
            pointerEvents: 'auto',
            touchAction: 'manipulation',
            fontFamily: SANS, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.14)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,232,224,0.07)'; e.currentTarget.style.borderColor = 'rgba(240,232,224,0.18)'; }}
        >
          {invitationUnlocked ? 'Add yours →' : <span style={{ fontSize: 22 }}>+</span>}
        </button>
      </div>

      <AddToHomeScreen />

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* "Add yours" — frosted overlay over the still-visible, still-drifting sky */}
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
              initialQuestionId={currentQuestionId ?? LANDING_QUESTION_ID}
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

export default function LandingPage() {
  return (
    <Suspense>
      <LandingPageInner />
    </Suspense>
  );
}
