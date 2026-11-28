/**
 * How one MLB StatsAPI transaction becomes a RawEvent: which event_type, what
 * the payload's transaction_type says, and whether it carries an injury
 * designation.
 *
 * Only an injured-list placement is an injury. Designated for assignment
 * (typeCode "DES") is a roster move: the club removes the player from the
 * 40-man roster. It has nothing to do with the injured list, so it gets no
 * designation and is emitted as a plain "transaction". It used to fall through
 * the placement branch to designation "IL-10" and post as an
 * "IL-10 placement" injury update.
 *
 * Pure (no store import) so it can be tested without opening a database.
 */

export interface MLBTransactionKind {
  event_type: "injury_update" | "transaction";
  transaction_type: string;
  designation: "IL-10" | "IL-15" | "IL-60" | undefined;
}

export function classifyMLBTransaction(tx: { typeCode: string; description: string }): MLBTransactionKind {
  const desc = (tx.description ?? "").toLowerCase();

  if (tx.typeCode === "DES") {
    return { event_type: "transaction", transaction_type: "Designated for assignment", designation: undefined };
  }

  const isActivation =
    tx.typeCode === "CU" ||
    (tx.typeCode === "SC" && desc.includes("activated"));
  if (isActivation) {
    return { event_type: "transaction", transaction_type: "IL activation", designation: undefined };
  }

  const designation =
    desc.includes("60-day") ? "IL-60"
    : desc.includes("15-day") ? "IL-15"
    : "IL-10";
  return { event_type: "injury_update", transaction_type: `${designation} placement`, designation };
}
