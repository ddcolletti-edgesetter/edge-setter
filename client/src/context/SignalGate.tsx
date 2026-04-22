/**
 * SignalGate — per-session free signal tracking.
 *
 * Rules:
 *  - FREE_LIMIT = 3 signals
 *  - Tracks viewed signal IDs in a Set so back/fwd nav doesn't double-count
 *  - No localStorage/sessionStorage — pure React state
 *  - isPro is always false for non-authenticated visitors (no auth in this app)
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export const FREE_LIMIT = 3;

interface SignalGateState {
  viewedIds: Set<string>;
  freeCount: number;
  isGated: boolean;
  isPro: boolean;
  /** Returns true if allowed to view. Registers the ID if new and under limit. */
  consumeSignal: (id: string) => boolean;
  /** Returns true if this specific signal is free to view (already seen OR under limit). */
  canView: (id: string) => boolean;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const SignalGateContext = createContext<SignalGateState | null>(null);

export function SignalGateProvider({ children }: { children: ReactNode }) {
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const isPro = false;

  const freeCount = viewedIds.size;
  // isGated = there ARE signals beyond the free limit visible (i.e. some are locked)
  // This is true as soon as the feed has more than FREE_LIMIT signals.
  // We derive it from freeCount hitting FREE_LIMIT.
  const isGated = !isPro && freeCount >= FREE_LIMIT;

  const canView = useCallback((id: string): boolean => {
    if (isPro) return true;
    if (viewedIds.has(id)) return true;          // already seen this session
    return viewedIds.size < FREE_LIMIT;           // still have budget
  }, [viewedIds, isPro]);

  const consumeSignal = useCallback((id: string): boolean => {
    if (isPro) return true;
    if (viewedIds.has(id)) return true;           // dedup — no double count
    if (viewedIds.size >= FREE_LIMIT) return false;
    setViewedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    return true;
  }, [viewedIds, isPro]);

  return (
    <SignalGateContext.Provider value={{
      viewedIds, freeCount, isGated, isPro,
      consumeSignal, canView,
      modalOpen,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false),
    }}>
      {children}
    </SignalGateContext.Provider>
  );
}

export function useSignalGate(): SignalGateState {
  const ctx = useContext(SignalGateContext);
  if (!ctx) throw new Error("useSignalGate must be used inside SignalGateProvider");
  return ctx;
}
