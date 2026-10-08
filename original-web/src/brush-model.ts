/* Pure brush-stroke bookkeeping, extracted from the renderer's brush closure.
   clear() must discard the committed strokes AND any in-progress stroke, so a
   pointer-up after a clear cannot resurrect the stroke being drawn. */
export type BrushState<S> = { strokes: S[]; current: S | null; drawing: boolean };

export function clearBrush<S>(state: BrushState<S>, drop: (s: S) => void): void {
  while (state.strokes.length) {
    const s = state.strokes.pop();
    if (s === undefined) break;
    drop(s);
  }
  if (state.current) { drop(state.current); state.current = null; }
  state.drawing = false;
}
