/** Keyboard-shortcut guard: global keys must never fire while the user is editing.
    Structural (not instanceof) so the contract is testable without a DOM. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;
  const el = target as { isContentEditable?: unknown; tagName?: unknown };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === "string" ? el.tagName : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
