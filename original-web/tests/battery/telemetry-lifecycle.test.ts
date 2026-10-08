import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let hidden: (()=>void)|undefined;
const event=(ok=true,durationMs=1)=>({edge:'A-B',from:'A',to:'B',name:'battery',durationMs,ok});
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  hidden=undefined;vi.stubGlobal('window',{addEventListener:(name:string,fn:()=>void)=>{if(name==='pagehide')hidden=fn;}});
  vi.stubGlobal('navigator',{sendBeacon:vi.fn(()=>true)});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200})));
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
describe('telemetry lifecycle and rolling contracts',()=>{
  it('burst of 50 is one batch and remaining data waits for timer',async()=>{
    const t=await import('../../src/telemetry');for(let i=0;i<50;i++)t.emitWide(event());
    expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).toHaveLength(50);
    t.emitWide(event());await vi.advanceTimersByTimeAsync(2000);expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([1,24,50,500,1000])('stream ring stays bounded for %i events',async count=>{
    const t=await import('../../src/telemetry');for(let i=0;i<count;i++)t.emitWide(event());expect(t.recentEvents()).toHaveLength(Math.min(500,count));
  });
  it('recent success rolls old errors out of health [F15]',async()=>{
    const t=await import('../../src/telemetry');for(let i=0;i<24;i++)t.emitWide(event(false));vi.advanceTimersByTime(10);
    for(let i=0;i<24;i++)t.emitWide(event());expect(t.edgeHealth('A-B')).toBe('ok');
  });
  it('slow sample rolls out of last-eight health window',async()=>{
    const t=await import('../../src/telemetry');t.emitWide(event(true,1000));expect(t.edgeHealth('A-B')).toBe('degraded');
    for(let i=0;i<8;i++)t.emitWide(event());expect(t.edgeHealth('A-B')).toBe('ok');
  });
  it('pagehide sends pending data once',async()=>{
    const t=await import('../../src/telemetry');t.emitWide(event());hidden!();hidden!();expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);expect(fetch).not.toHaveBeenCalled();
  });
  it('rejected beacon preserves data for a later successful delivery [F16]',async()=>{
    vi.mocked(navigator.sendBeacon).mockReturnValue(false);const t=await import('../../src/telemetry');t.emitWide(event());hidden!();
    vi.mocked(navigator.sendBeacon).mockReturnValue(true);hidden!();expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
  });
  it('transient server failure does not permanently disable sink [F16]',async()=>{
    vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:500} as Response);const t=await import('../../src/telemetry');
    for(let i=0;i<50;i++)t.emitWide(event());await Promise.resolve();await Promise.resolve();
    for(let i=0;i<50;i++)t.emitWide(event());await vi.advanceTimersByTimeAsync(4000);expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(1);
  });
  it('listener removal prevents future notifications',async()=>{
    const t=await import('../../src/telemetry');const listener=vi.fn(),off=t.onWideEvent(listener);t.emitWide(event());off();t.emitWide(event());expect(listener).toHaveBeenCalledTimes(1);
  });
  it('traceEdge preserves result and rejection identity',async()=>{
    const t=await import('../../src/telemetry');expect(await t.traceEdge('A-B','A','B','ok',()=>42)).toBe(42);
    const error=new Error('failure');await expect(t.traceEdge('A-B','A','B','bad',()=>{throw error;})).rejects.toBe(error);
    expect(t.recentEvents().map(e=>e.status)).toEqual(['OK','ERROR']);
  });
});
