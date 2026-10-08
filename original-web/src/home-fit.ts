/* Home-view fit (D6): the settled home must show every node label inside the visible canvas.
   Orthographic projection is linear in zoom about the camera target, so a label's offset from
   the canvas centre scales with zoom; the largest zoom that keeps every label box inside the
   bounds is a closed-form minimum over the labels. */
export interface HomeLabel {
  /** label anchor offset from the canvas centre, in px, at `zoom` (x right, y down) */
  dx: number; dy: number;
  /** measured label box (labels are centred on the anchor x and hang below the anchor y) */
  w: number; h: number;
}
export interface HomeBounds { left: number; right: number; top: number; bottom: number } /* px, relative to the canvas centre */

/** Returns the zoom (<= zoom) at which every label box lies inside `bounds`; never raises zoom. */
export function fitHomeZoom(labels: readonly HomeLabel[], bounds: HomeBounds, zoom: number, minZoom: number, pad = 2): number {
  let s=1;
  for(const l of labels){
    const hw=l.w/2;
    /* x: dx*s + hw <= right-pad ; dx*s - hw >= left+pad (offsets scale, box size does not) */
    if(l.dx>0){const room=bounds.right-pad-hw;s=Math.min(s,room>0?room/l.dx:0);}
    else if(l.dx<0){const room=-(bounds.left+pad)-hw;s=Math.min(s,room>0?room/-l.dx:0);}
    /* y: box spans [dy*s, dy*s+h] */
    if(l.dy>0){const room=bounds.bottom-pad-l.h;s=Math.min(s,room>0?room/l.dy:0);}
    else if(l.dy<0){const room=-(bounds.top+pad);s=Math.min(s,room>0?room/-l.dy:0);}
  }
  return Math.max(minZoom,zoom*Math.min(1,Math.max(0,s)));
}
