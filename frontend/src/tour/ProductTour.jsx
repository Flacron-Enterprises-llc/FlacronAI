import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';

const PAD = 6; // spotlight padding around the target
const GAP = 14; // between the spotlight and the tooltip
const MARGIN = 16; // from the viewport edge
const MOBILE_QUERY = '(max-width: 767px)';
const SETTLE_MS = 700; // the mobile sidebar slides in over 300ms; keep measuring a bit longer

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

/** The step's element if it is rendered and at least partly inside the viewport. */
function onScreenRect(el) {
  if (!el || el.getClientRects().length === 0) return null;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return null;
  return r;
}

function findTarget(step) {
  for (const selector of [step.target, step.mobileTarget]) {
    if (!selector) continue;
    const candidates = Array.from(document.querySelectorAll(selector));
    const el = candidates.find((c) => c.getClientRects().length > 0);
    if (el) return el;
  }
  return null;
}

function placeTooltip(rect, tip, vw, vh, mobile) {
  if (mobile) {
    // A sheet across the screen, on the side away from the highlighted element.
    const width = vw - MARGIN * 2;
    const below = !rect || rect.top + rect.height / 2 < vh / 2;
    return { width, left: MARGIN, top: below ? vh - tip.h - MARGIN : MARGIN };
  }
  const width = Math.min(380, vw - MARGIN * 2);
  if (!rect) return { width, left: (vw - width) / 2, top: Math.max(MARGIN, (vh - tip.h) / 2) };
  const fits = {
    right: vw - rect.right - PAD >= width + GAP + MARGIN,
    bottom: vh - rect.bottom - PAD >= tip.h + GAP + MARGIN,
    top: rect.top - PAD >= tip.h + GAP + MARGIN,
    left: rect.left - PAD >= width + GAP + MARGIN,
  };
  const side = ['right', 'bottom', 'top', 'left'].find((s) => fits[s]) || 'bottom';
  let top;
  let left;
  if (side === 'right' || side === 'left') {
    left = side === 'right' ? rect.right + PAD + GAP : rect.left - PAD - GAP - width;
    top = rect.top + rect.height / 2 - tip.h / 2;
  } else {
    top = side === 'bottom' ? rect.bottom + PAD + GAP : rect.top - PAD - GAP - tip.h;
    left = rect.left + rect.width / 2 - width / 2;
  }
  return {
    width,
    left: Math.min(Math.max(MARGIN, left), vw - width - MARGIN),
    top: Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - tip.h - MARGIN)),
  };
}

/**
 * The on-screen walkthrough: dims the page, cuts a spotlight around the real
 * element each step describes, and shows a tooltip with Back / Next / Skip /
 * Finish. Steps whose element isn't on screen show as a centred card.
 * Keyboard: → or Enter next, ← back, Esc skip; focus stays inside the tooltip.
 */
export default function ProductTour({ steps, index, onNext, onBack, onSkip, onFinish }) {
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const reduceMotion = useReducedMotion();
  const tipRef = useRef(null);
  const primaryRef = useRef(null);
  const returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const [rect, setRect] = useState(null);
  const [tipSize, setTipSize] = useState({ w: 360, h: 220 });
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight, mobile: isMobileViewport() }));

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight, mobile: isMobileViewport() });
    const el = findTarget(step);
    const r = onScreenRect(el);
    setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null);
  }, [step]);

  // New step: bring its element into view, then keep measuring while things settle.
  useEffect(() => {
    const el = findTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const outside = r.top < 72 || r.bottom > window.innerHeight - 24;
      if (outside) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    let frame;
    const until = performance.now() + SETTLE_MS;
    const loop = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [step, measure, reduceMotion]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // The tooltip's real size drives its placement; re-read it whenever the content or layout changes.
  useLayoutEffect(() => {
    if (!tipRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = tipRef.current;
    if (w !== tipSize.w || h !== tipSize.h) setTipSize({ w, h });
  }, [index, viewport, rect, tipSize.w, tipSize.h]);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const previous = returnFocus.current;
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const finish = useCallback((cta) => onFinish(cta), [onFinish]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target === document.body)) {
        e.preventDefault();
        if (isLast) finish();
        else onNext();
      } else if (e.key === 'ArrowLeft' && !isFirst) {
        e.preventDefault();
        onBack();
      } else if (e.key === 'Tab' && tipRef.current) {
        const focusable = tipRef.current.querySelectorAll('button:not([disabled])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!tipRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFirst, isLast, onBack, onNext, onSkip, finish]);

  const pos = placeTooltip(rect, tipSize, viewport.w, viewport.h, viewport.mobile);
  const spotlight = rect && {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 };
  const progress = ((index + 1) / steps.length) * 100;
  const titleId = `tour-title-${step.id}`;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" data-product-tour="">
      {/* Click shield: the page underneath isn't interactive during the tour. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={(e) => e.stopPropagation()} />

      {spotlight ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-500"
          style={{ boxShadow: '0 0 0 9999px rgba(2, 12, 27, 0.62)' }}
          initial={false}
          animate={spotlight}
          transition={transition}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(2,12,27,0.62)]" />
      )}

      <motion.div
        ref={tipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-body`}
        className="absolute rounded-2xl border border-gray-200 bg-surface p-5 shadow-2xl shadow-black/30"
        style={{ width: pos.width }}
        initial={reduceMotion ? false : { opacity: 0, y: 8, left: pos.left, top: pos.top }}
        animate={{ opacity: 1, y: 0, left: pos.left, top: pos.top }}
        transition={transition}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Step {index + 1} of {steps.length}
          </span>
          {!isLast && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Skip tour"
              title="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mb-4 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <motion.div className="h-full rounded-full bg-brand-500" initial={false} animate={{ width: `${progress}%` }} transition={transition} />
        </div>

        <h2 id={titleId} className="text-base font-bold leading-snug text-gray-900">
          {step.title}
        </h2>
        <p id={`${titleId}-body`} className="mt-1.5 text-sm leading-relaxed text-gray-600">
          {step.body}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {!isLast ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Skip tour
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            )}
            {isLast && step.cta === 'generate' && (
              <button type="button" onClick={() => finish('generate')} className="btn-secondary px-3 py-2 text-sm">
                Create my first report
              </button>
            )}
            {isLast ? (
              <button ref={primaryRef} type="button" onClick={() => finish()} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                <Check className="h-4 w-4" aria-hidden="true" />
                Finish
              </button>
            ) : (
              <button ref={primaryRef} type="button" onClick={onNext} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                Next
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
