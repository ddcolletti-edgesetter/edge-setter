/**
 * Edge Setter — how many cards a board shows before the reader asks for more.
 *
 * The four boards rendered every row they had. On prod today that is 185 cards
 * on NFL and 212 on CFB, which presents the twentieth card and the
 * two-hundredth as equally worth reading, and makes the ranking the page just
 * did invisible. The cap shows the top BOARD_INITIAL_CARD_CAP and puts the rest
 * one click away.
 *
 * It is a VIEW cap, not a filter: nothing is dropped, the count says how many
 * are held back, and one click shows them all. That is the difference between
 * this and {@link withinBoardAge}, which removes rows that should not be on the
 * page at all.
 *
 * Lives here rather than in each page because all four render the same control
 * and a board that capped at a different number, or forgot the button, would be
 * a silent inconsistency.
 */
import { useCallback, useMemo, useState } from "react";

import { BOARD_INITIAL_CARD_CAP } from "@/lib/boardSituations";
import { Button } from "@/components/ui/button";

export interface BoardCardCapState<T> {
  /** The items to render now. */
  readonly visible: readonly T[];
  /** How many are held back. Zero once expanded, or when there was nothing to hold back. */
  readonly hidden: number;
  /** The whole list, for a count that wants to name the total. */
  readonly total: number;
  readonly expanded: boolean;
  readonly showAll: () => void;
}

export function useBoardCardCap<T>(
  items: readonly T[],
  cap: number = BOARD_INITIAL_CARD_CAP,
): BoardCardCapState<T> {
  const [expanded, setExpanded] = useState(false);
  const showAll = useCallback(() => setExpanded(true), []);
  return useMemo(() => {
    const visible = expanded ? items : items.slice(0, cap);
    return {
      visible,
      hidden: items.length - visible.length,
      total: items.length,
      expanded,
      showAll,
    };
  }, [cap, expanded, items, showAll]);
}

/**
 * The control. Renders nothing when nothing is held back, so a board with fewer
 * cards than the cap looks exactly as it did.
 */
export function BoardShowMoreCards({
  hidden,
  onShowAll,
  noun = "stories",
}: {
  hidden: number;
  onShowAll: () => void;
  noun?: string;
}) {
  if (hidden <= 0) return null;
  return (
    <div className="flex justify-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onShowAll}
        data-testid="board-show-more"
        className="text-[0.72rem] font-bold uppercase tracking-widest"
      >
        {`Show ${hidden} more ${noun}`}
      </Button>
    </div>
  );
}
