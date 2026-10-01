type ViewState = { theme: string | null; dotSet: number; lineSet: number; stacked: boolean; pinned: string | null; cam: { p: number[]; t: number[]; zoom: number }; reds: string[] };
declare global {
  interface Window {
    __isoEdgeMid: (key: string) => { x: number; y: number } | null;
    odinView: {
      set: (az: number, pol: number, radius: number, zoom: number) => void;
      look: (x: number, z: number, zoom?: number, az?: number, pol?: number) => void;
      restore: () => void;
      inspect: (id: string) => void;
      media: {
        state: (id: string) => { hasMedia: boolean; audible: boolean; playing: boolean; t: number };
        togglePlay: (id: string) => void;
        solo: (id: string) => void;
      };
      state: () => { zoom: number; cordon: string[]; audioFocus: string | null; masterAudio: boolean };
    };
    __isoRouteQC: Record<string, unknown>;
    __lblMeasured: boolean;
    __lblTick: number;
    __isoViewState: () => ViewState;
    __isoApplySpec: (spec: unknown) => void;
    __isoSwapState: () => unknown;
  }
}
declare module "*.mjs" {
  export function isoRouteAll(
    nodes: ReadonlyArray<{ id: string; x: number; y: number; w: number; d: number }>,
    edges: ReadonlyArray<readonly [string, string, string?]>,
  ): {
    routes: Record<string, Array<[number, number]>>;
    hops: Record<string, Array<[number, number]>>;
    qc: Record<string, unknown>;
  };
}
export {};
