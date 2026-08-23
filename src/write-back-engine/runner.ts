import { officeWriteBackAdapter } from "./office-adapter";
import { preflightReviewItem } from "./preflight";
import type {
  ApplySingleReviewItemInput,
  WriteBackDocumentAdapter,
  WriteBackResult,
} from "./types";

function preflightFailure(
  input: ApplySingleReviewItemInput,
  result: ReturnType<typeof preflightReviewItem>
): WriteBackResult {
  const status = result.statusOnFailure ?? "FAILED";
  return {
    reviewItemId: input.reviewItem.reviewItemId,
    status,
    actionKind: input.reviewItem.proposedAction?.type,
    reason: result.reasons[0],
    reasons: result.reasons,
    message:
      status === "STALE"
        ? "Die Fußnote wurde seit der Analyse verändert. Bitte prüfen Sie die Fußnote erneut."
        : "Die Änderung konnte technisch nicht sicher angewendet werden.",
  };
}

export async function applySingleReviewItem(
  input: ApplySingleReviewItemInput,
  adapter: WriteBackDocumentAdapter = officeWriteBackAdapter
): Promise<WriteBackResult> {
  const preflight = preflightReviewItem(input.reviewItem, input.footnote);
  if (!preflight.ok) return preflightFailure(input, preflight);
  try {
    return await adapter.applySingle(input);
  } catch {
    return {
      reviewItemId: input.reviewItem.reviewItemId,
      status: "FAILED",
      actionKind: input.reviewItem.proposedAction?.type,
      reason: "WORD_API_ERROR",
      reasons: ["WORD_API_ERROR"],
      message: "Die Änderung konnte technisch nicht sicher angewendet werden.",
      fatal: true,
    };
  }
}
