import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GUIDES, type GuideId } from '../guideContent';

/**
 * Hover guide.
 *
 * Wraps any control and explains what it does after a short hover. Two
 * details of this app shape the implementation:
 *
 *   1. index.css sets `cursor: none` globally (custom cursor), so the
 *      native `title=""` tooltip is both ugly and slow here — hence a
 *      real component.
 *   2. index.css also sets `border-color: transparent !important` on
 *      `*`, so the card outline is drawn with box-shadow, not `border`.
 *
 * The wrapper uses `display: contents` so it generates no box of its own
 * and cannot disturb the flex/grid layout of whatever it wraps.
 */

const SHOW_DELAY_MS = 340;
const EDGE_MARGIN = 10;
const GAP = 8;

const STORAGE_KEY = 'mb_guides_enabled';
const CHANGE_EVENT = 'mb-guides-changed';

export function guidesEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function setGuidesEnabled(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribe to the on/off state so the Settings toggle updates live. */
export function useGuidesEnabled(): boolean {
  const [on, setOn] = useState(guidesEnabled);
  useEffect(() => {
    const sync = () => setOn(guidesEnabled());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(CHANGE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  return on;
}

function accent(): string {
  try { return localStorage.getItem('mb_accent_color') || '#e8d44d'; } catch { return '#e8d44d'; }
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

type Side = 'top' | 'bottom' | 'left' | 'right';

interface GuideProps {
  /** Key into guideContent.ts — the normal way to use this. */
  id?: GuideId;
  /** One-off copy, when a guide is dynamic (a profile name, a count). */
  title?: string;
  body?: string;
  shortcut?: string;
  /** Preferred placement. Flips automatically when there is no room. */
  side?: Side;
  /** Skip the guide without unwrapping the element (e.g. while loading). */
  disabled?: boolean;
  children: React.ReactNode;
}

interface Placement { top: number; left: number; side: Side; arrow: number }

export default function Guide({ id, title, body, shortcut, side = 'top', disabled, children }: GuideProps) {
  const entry = id ? GUIDES[id] : undefined;
  const heading = title ?? entry?.title ?? '';
  const text = body ?? entry?.body ?? '';
  const keys = shortcut ?? (entry && 'shortcut' in entry ? (entry as { shortcut?: string }).shortcut : undefined);

  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);

  const enabled = useGuidesEnabled();
  const active = enabled && !disabled && !!text;

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPlace(null);
  }, []);

  const openSoon = useCallback(() => {
    if (!active) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }, [active]);

  // Close on anything that would leave the card floating over the wrong
  // spot: scrolling, resizing, clicking, or tabbing away.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('pointerdown', onScroll, true);
    window.addEventListener('keydown', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pointerdown', onScroll, true);
      window.removeEventListener('keydown', onScroll, true);
    };
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure once mounted, then place. Runs before paint so the card
  // never appears in the wrong position first.
  useLayoutEffect(() => {
    if (!open) return;
    const host = anchorRef.current?.firstElementChild as HTMLElement | null;
    const card = cardRef.current;
    if (!host || !card) return;

    const a = host.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const room: Record<Side, number> = {
      top: a.top,
      bottom: vh - a.bottom,
      left: a.left,
      right: vw - a.right,
    };
    const needed = (s: Side) => (s === 'top' || s === 'bottom' ? c.height + GAP : c.width + GAP);

    // Preferred side, then its opposite, then whatever fits best.
    const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    let chosen: Side = side;
    if (room[side] < needed(side)) {
      chosen = room[opposite[side]] >= needed(opposite[side])
        ? opposite[side]
        : (Object.keys(room) as Side[]).sort((x, y) => (room[y] - needed(y)) - (room[x] - needed(x)))[0];
    }

    let top: number;
    let left: number;
    if (chosen === 'top') { top = a.top - c.height - GAP; left = a.left + a.width / 2 - c.width / 2; }
    else if (chosen === 'bottom') { top = a.bottom + GAP; left = a.left + a.width / 2 - c.width / 2; }
    else if (chosen === 'left') { left = a.left - c.width - GAP; top = a.top + a.height / 2 - c.height / 2; }
    else { left = a.right + GAP; top = a.top + a.height / 2 - c.height / 2; }

    const clampedLeft = Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, vw - c.width - EDGE_MARGIN));
    const clampedTop = Math.min(Math.max(top, EDGE_MARGIN), Math.max(EDGE_MARGIN, vh - c.height - EDGE_MARGIN));

    // Keep the arrow pointing at the control even after clamping.
    const arrow = chosen === 'top' || chosen === 'bottom'
      ? Math.min(Math.max(a.left + a.width / 2 - clampedLeft, 12), c.width - 12)
      : Math.min(Math.max(a.top + a.height / 2 - clampedTop, 12), c.height - 12);

    setPlace({ top: clampedTop, left: clampedLeft, side: chosen, arrow });
  }, [open, side]);

  const color = accent();
  const reduced = prefersReducedMotion();

  const arrowStyle = (p: Placement): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 7,
      height: 7,
      backgroundColor: 'var(--color-bg-card)',
      transform: 'rotate(45deg)',
    };
    if (p.side === 'top') return { ...base, left: p.arrow - 3.5, bottom: -4, boxShadow: '2px 2px 0 0 var(--color-border-hover)' };
    if (p.side === 'bottom') return { ...base, left: p.arrow - 3.5, top: -4, boxShadow: '-2px -2px 0 0 var(--color-border-hover)' };
    if (p.side === 'left') return { ...base, top: p.arrow - 3.5, right: -4, boxShadow: '2px -2px 0 0 var(--color-border-hover)' };
    return { ...base, top: p.arrow - 3.5, left: -4, boxShadow: '-2px 2px 0 0 var(--color-border-hover)' };
  };

  return (
    <>
      <span
        ref={anchorRef}
        style={{ display: 'contents' }}
        onMouseEnter={openSoon}
        onMouseLeave={close}
        onFocusCapture={openSoon}
        onBlurCapture={close}
      >
        {children}
      </span>

      {open && active && createPortal(
        <div
          ref={cardRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: place ? place.top : -9999,
            left: place ? place.left : -9999,
            zIndex: 2147483000,
            pointerEvents: 'none',
            maxWidth: 248,
            padding: '8px 10px',
            borderRadius: 10,
            backgroundColor: 'var(--color-bg-card)',
            // `border` is force-transparented globally, so outline the
            // card with a shadow ring instead.
            boxShadow: '0 0 0 1px var(--color-border-hover), 0 10px 28px rgba(0,0,0,0.45)',
            opacity: place ? 1 : 0,
            transform: place || reduced ? 'none' : 'translateY(2px)',
            transition: reduced ? 'none' : 'opacity 120ms ease, transform 120ms ease',
          }}
        >
          {place && <span style={arrowStyle(place)} />}
          {heading && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color, lineHeight: 1.3, marginBottom: text ? 3 : 0 }}>
              {heading}
            </div>
          )}
          {text && (
            <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-secondary)' }}>
              {text}
            </div>
          )}
          {keys && (
            <div style={{ marginTop: 6, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-muted)' }}>
              <span style={{ padding: '1.5px 5px', borderRadius: 4, backgroundColor: 'var(--color-bg-primary)', boxShadow: '0 0 0 1px var(--color-border-primary)' }}>{keys}</span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
