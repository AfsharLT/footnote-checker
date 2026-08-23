import type { ProposedReviewAction, ReviewConflict, ReviewItem } from "./types";

interface ActionEntry {
  item: ReviewItem;
  action: ProposedReviewAction;
  start: number;
  end: number;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function actionBounds(action: ProposedReviewAction): { start: number; end: number } {
  return action.type === "TEXT_INSERT"
    ? { start: action.position, end: action.position }
    : { start: action.start, end: action.end };
}

function rangesOverlap(left: ActionEntry, right: ActionEntry): boolean {
  const leftInsert = left.start === left.end;
  const rightInsert = right.start === right.end;
  if (leftInsert && rightInsert) return left.start === right.start;
  if (leftInsert) return left.start >= right.start && left.start < right.end;
  if (rightInsert) return right.start >= left.start && right.start < left.end;
  return left.start < right.end && right.start < left.end;
}

function changesConflict(
  left: Extract<ProposedReviewAction, { type: "FORMAT_CHANGE" }>,
  right: Extract<ProposedReviewAction, { type: "FORMAT_CHANGE" }>
): boolean {
  return Object.keys(left.changes).some(
    (property) =>
      property in right.changes &&
      left.changes[property as keyof typeof left.changes] !==
        right.changes[property as keyof typeof right.changes]
  );
}

function actionsConflict(left: ActionEntry, right: ActionEntry): boolean {
  if (!rangesOverlap(left, right)) return false;
  if (left.action.type === "FORMAT_CHANGE" && right.action.type === "FORMAT_CHANGE") {
    return changesConflict(left.action, right.action);
  }
  if (left.action.type === "TEXT_INSERT" && right.action.type === "TEXT_INSERT") {
    return left.action.text !== right.action.text;
  }
  if (left.action.type === "TEXT_REPLACE" && right.action.type === "TEXT_REPLACE") {
    return !(
      left.action.start === right.action.start &&
      left.action.end === right.action.end &&
      left.action.replacementText === right.action.replacementText
    );
  }
  if (
    (left.action.type === "TEXT_REPLACE" && right.action.type === "FORMAT_CHANGE") ||
    (left.action.type === "FORMAT_CHANGE" && right.action.type === "TEXT_REPLACE")
  ) {
    return false;
  }
  return true;
}

export function detectReviewConflicts(items: readonly ReviewItem[]): ReviewConflict[] {
  const byFootnote = new Map<string, ActionEntry[]>();
  items.forEach((item) => {
    if (!item.proposedAction) return;
    const bounds = actionBounds(item.proposedAction);
    const entry = { item, action: item.proposedAction, ...bounds };
    const group = byFootnote.get(item.finding.footnoteId);
    if (group) group.push(entry);
    else byFootnote.set(item.finding.footnoteId, [entry]);
  });

  const conflicts: ReviewConflict[] = [];
  byFootnote.forEach((entries, footnoteId) => {
    entries.sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.item.reviewItemId.localeCompare(right.item.reviewItemId)
    );
    const parent = entries.map((_, index) => index);
    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) cursor = parent[cursor];
      while (parent[index] !== index) {
        const next = parent[index];
        parent[index] = cursor;
        index = next;
      }
      return cursor;
    };
    const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
    };
    const active: number[] = [];
    entries.forEach((entry, index) => {
      for (let activeIndex = active.length - 1; activeIndex >= 0; activeIndex -= 1) {
        if (entries[active[activeIndex]].end < entry.start) active.splice(activeIndex, 1);
      }
      active.forEach((candidateIndex) => {
        if (actionsConflict(entries[candidateIndex], entry)) union(candidateIndex, index);
      });
      active.push(index);
    });

    const components = new Map<number, string[]>();
    entries.forEach((entry, index) => {
      const root = find(index);
      const component = components.get(root);
      if (component) component.push(entry.item.reviewItemId);
      else components.set(root, [entry.item.reviewItemId]);
    });
    components.forEach((reviewItemIds) => {
      if (reviewItemIds.length < 2) return;
      const sortedIds = [...reviewItemIds].sort();
      conflicts.push({
        conflictId: `review-conflict:${footnoteId}:${stableHash(sortedIds.join("|"))}`,
        reviewItemIds: sortedIds,
        reason: "Die vorgeschlagenen Änderungen überlappen sich widersprüchlich.",
      });
    });
  });
  return conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId));
}
