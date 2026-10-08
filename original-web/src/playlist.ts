/* Pure playlist model: picking a track energizes exactly that module.
   Extracted from the renderer's playlist row handler with zero behavior change. */
export function energizeTrack(cordon: Set<string>, id: string): void {
  cordon.clear();
  cordon.add(id);
}
