/**
 * SignalGate — per-session free signal tracking + Pro modal state.
 *
 * Rules:
 *  - FREE_LIMIT = 3 readable rows (rows 4+ are blurred for free users)
 *  - Tracks viewed signal IDs in a Set so back/fwd nav doesn't double-count
 *  - No localStorage/sessionStorage — pure React state
 *  - isPro is always false for non-authenticated visitors (no auth in this app)
 *  - modalTrigger tracks which board triggered the modal for context-aware copy
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export const FREE_LIMIT = 3;

export type ModalTrigger = "NBA" | "MLB" | "NFL" | "CFB" | "generic";

interface SignalGateState {
  viewedIds: Set<string>;
  freeCount: number;
  isGated: boolean;
  isPro: boolean;
  /** Returns true if this specific signal is free to view (already seen OR under limit). */
  canView: (id: string) => boolean;
  /** Returns true if row index (0-based) is free — first FREE_LIMIT rows always free. */
  rowIsFree: (idx: number) => boolean;
  modalOpen: boolean;
  modalTrigger: ModalTrigger;
  openModal: (trigger?: ModalTrigger) => void;
  closeModal: () => void;
}

const SignalGateContext = createContext<SignalGateState | null>(null);

export function SignalGateProvider({ children }: { children: ReactNode }) {
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTrigger, setModalTrigger] = useState<ModalTrigger>("generic");
  const isPro = false;

  const freeCount = viewedIds.size;
  const isGated = !isPro;

  const canView = useCallback((id: string): boolean => {
    if (isPro) return true;
    return viewedIds.has(id) || viewedIds.size < FREE_LIMIT;
  }, [viewedIds, isPro]);

  // Row-based gating: first FREE_LIMIT rows (idx 0,1,2) always free
  const rowIsFree = useCallback((idx: number): boolean => {
    if (isPro) return true;
    return idx < FREE_LIMIT;
  }, [isPro]);

  const openModal = useCallback((trigger: ModalTrigger = "generic") => {
    setModalTrigger(trigger);
    setModalOpen(true);
  }, []);

  return (
    <SignalGateContext.Provider value={{
      viewedIds, freeCount, isGated, isPro,
      canView, rowIsFree,
      modalOpen, modalTrigger,
      openModal,
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
