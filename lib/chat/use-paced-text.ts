import { useCallback, useEffect, useRef } from "react";

/**
 * usePacedText
 *
 * Decouples network arrival from display rendering for streaming text.
 * Tokens arrive from the SSE stream in irregular network bursts; feeding
 * them straight to React state makes the display cadence track those
 * bursts, which reads as jarring. This hook accumulates incoming text in a
 * buffer and drains it to `onText` at a steady visual rate via
 * requestAnimationFrame, producing the constant-speed reveal that makes
 * streaming feel smooth.
 *
 * Drain strategy: each frame releases `ceil(buffer.length / divisor)`
 * characters (minimum 1). Proportional release catches a burst up quickly
 * (but never instantly) while a trickle reveals ~1 char/frame — self-tuning
 * to the arrival rate without a fixed chars-per-second target.
 *
 * Returned controls:
 *   - append(text): buffer text for paced reveal (used for "token" events).
 *   - flush():      emit all buffered text immediately and stop the loop
 *                   (used at stream end / abort, and before any structural
 *                   event whose splicing or lookups depend on the message's
 *                   current text — see ChatInterface.handleStreamEvent).
 *   - reset():      drop the buffer and stop the loop without emitting
 *                   (used as a clean slate at the start of each request).
 *
 * Reduced motion: under prefers-reduced-motion: reduce, append() bypasses
 * the buffer and emits immediately, so motion-sensitive users keep the
 * pre-pacing behavior (text appears as it arrives).
 *
 * Identity stability: `onText` is typically an inline arrow recreated every
 * render, and `divisor` could change. Both are read through refs, so the
 * returned append/flush/reset keep stable identities and the unmount cleanup
 * runs once — rather than re-running (and flushing) on every render, which
 * would defeat the pacing. The drain loop likewise lives in a ref and
 * self-schedules via that ref, avoiding a forward self-reference.
 */
interface UsePacedTextOptions {
  /** Invoked with each paced slice of text. Latest value is always used. */
  onText: (text: string) => void;
  /**
   * Pacing rate: characters released per frame = ceil(buffer.length /
   * divisor), min 1. Lower = faster reveal. 8 reads paced-but-not-slow on
   * typical message lengths; tune if it lags or still feels bursty.
   */
  divisor?: number;
}

export function usePacedText({ onText, divisor = 8 }: UsePacedTextOptions) {
  const bufferRef = useRef("");
  const frameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const onTextRef = useRef(onText);
  const drainRef = useRef<() => void>(() => {});

  // Refresh the latest onText and a fresh drain closure (which captures the
  // current divisor) every render, so the callbacks below stay identity-stable
  // while still seeing the latest values. The effect body only assigns refs —
  // it never calls setState — and the closure runs later inside rAF.
  useEffect(() => {
    onTextRef.current = onText;
    drainRef.current = () => {
      frameRef.current = null;
      const buffer = bufferRef.current;
      if (buffer.length === 0) return;
      const releaseCount = Math.max(1, Math.ceil(buffer.length / divisor));
      bufferRef.current = buffer.slice(releaseCount);
      onTextRef.current(buffer.slice(0, releaseCount));
      if (bufferRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(() => drainRef.current());
      }
    };
  });

  // Track the reduced-motion preference (SSR-safe; updates if it changes).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const append = useCallback((text: string) => {
    // Reduced motion: bypass pacing entirely.
    if (reducedMotionRef.current) {
      onTextRef.current(text);
      return;
    }
    bufferRef.current += text;
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => drainRef.current());
    }
  }, []);

  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (bufferRef.current.length > 0) {
      onTextRef.current(bufferRef.current);
      bufferRef.current = "";
    }
  }, []);

  const reset = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    bufferRef.current = "";
  }, []);

  // Unmount-only cleanup: cancel any pending frame (no orphaned loop) and
  // flush the tail. Empty deps (the callbacks are identity-stable) so this
  // runs once. The flush is defensive — on a true unmount the setState is a
  // no-op, but it costs nothing and guards reuse / teardown edge cases.
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (bufferRef.current.length > 0) {
        onTextRef.current(bufferRef.current);
        bufferRef.current = "";
      }
    };
  }, []);

  return { append, flush, reset };
}
