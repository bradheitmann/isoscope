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
        restart: (id: string) => void;
      };
      viewFace: (id: string, face: "roof" | "north" | "south" | "east" | "west" | "bottom") => void;
      faceView: () => { id: string; face: string } | null;
      exitFace: () => void;
      state: () => { zoom: number; cordon: string[]; audioFocus: string | null; masterAudio: boolean; faceView: { id: string; face: string } | null };
      edgeHealth: () => Record<string, string>;
      /* the current broken/degraded edges with live metrics (worst first) */
      attention: () => Array<{ edge: string; health: string; total: number; errors: number; errorRate: number; p50: number; p95: number; ratePerMin: number }>;
    };
    __isoRouteQC: Record<string, unknown>;
    __lblMeasured: boolean;
    __lblTick: number;
    __isoCanvasRect: () => { left: number; top: number; right: number; bottom: number };
    __isoViewState: () => ViewState;
    __isoApplySpec: (spec: unknown) => void;
    __isoRenderTagPills: (container: HTMLElement, ids: string[]) => void;
    __isoSwapState: () => unknown;
  }
}
export {};
