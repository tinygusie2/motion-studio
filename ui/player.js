// Loaded into the editor preview only. Plays/seeks the composition like the HyperFrames renderer:
// the GSAP timeline is seeked, and every timed <video>/<audio> is shown and synced inside its window.
(() => {
  const root = document.getElementById('root');
  const id = root.dataset.compositionId;
  const DUR = +root.dataset.duration;
  const tl = window.__timelines[id];
  // Audio level = data-volume × the HyperFrames volume lane (clip-local, linear, ends held), as in the render.
  const lanesOf = el => { try { return JSON.parse(el.dataset.automation || '{}').lanes || []; } catch { return []; } };
  const laneOf = el => lanesOf(el).find(l => l.target === 'volume')?.points || null;
  // Effect chains (data-fx-chain): peaking/shelf/pass filters and gain run through Web Audio here, with their
  // fx.<id>.<param> lanes; the renderer runs the same chain, so the voice carve is heard while editing too.
  let ctx = null;
  const FILTERS = { peaking: 'peaking', lowshelf: 'lowshelf', highshelf: 'highshelf', highpass: 'highpass', lowpass: 'lowpass' };
  function wireFx(m) {
    let chain; try { chain = JSON.parse(m.el.dataset.fxChain || 'null'); } catch {}
    const nodes = (chain?.nodes || []).filter(n => n.enabled !== false && (FILTERS[n.type] || n.type === 'gain'));
    if (!nodes.length || m.graph) return;
    try {
      ctx ??= new AudioContext();
      let prev = ctx.createMediaElementSource(m.el);
      const params = [];
      for (const n of nodes) {
        let node;
        if (n.type === 'gain') { node = ctx.createGain(); node.gain.value = 10 ** ((n.params?.gain ?? 0) / 20); params.push({ id: n.id, gain: g => (node.gain.value = 10 ** (g / 20)) }); }
        else {
          node = ctx.createBiquadFilter(); node.type = FILTERS[n.type];
          node.frequency.value = n.params?.frequency ?? 1000; node.Q.value = n.params?.q ?? 1; node.gain.value = n.params?.gain ?? 0;
          params.push({ id: n.id, gain: g => (node.gain.value = g), frequency: f => (node.frequency.value = f), q: q => (node.Q.value = q) });
        }
        prev.connect(node); prev = node;
        m.nodes = [...(m.nodes || []), { id: n.id, node }];
      }
      const level = ctx.createGain(); // the element's own volume no longer applies once it feeds Web Audio
      prev.connect(level); level.connect(ctx.destination);
      const lanes = lanesOf(m.el).filter(l => l.target.startsWith('fx.')).map(l => { const [, id, param] = l.target.split('.'); return { set: params.find(x => x.id === id)?.[param], points: l.points }; }).filter(l => l.set && l.points?.length);
      m.graph = { level, lanes };
    } catch (e) { console.warn('fx chain not wired:', e.message); }
  }
  const laneAt = (pts, t) => {
    if (t <= pts[0].t) return pts[0].v;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (t <= b.t) return b.t > a.t ? a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t) : b.v; }
    return pts[pts.length - 1].v;
  };
  const media = [...document.querySelectorAll('.clip[data-start], audio[data-start]')].map(el => ({
    el, still: el.tagName === 'IMG', start: +el.dataset.start, dur: +el.dataset.duration, from: +(el.dataset.mediaStart || 0), rate: +(el.dataset.playbackRate || 1),
    vol: el.dataset.volume != null ? +el.dataset.volume : 1, lane: laneOf(el)
  }));
  media.forEach(m => { if (!m.still) m.el.preload = 'auto'; if (m.el.tagName !== 'AUDIO') m.el.style.visibility = 'hidden'; });

  let t = 0, playing = false, last = 0, raf = 0, loopEnd = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn(t, playing));

  function sync(exact) {
    for (const m of media) {
      const active = t >= m.start && t < m.start + m.dur;
      if (m.el.tagName !== 'AUDIO') m.el.style.visibility = active ? 'visible' : 'hidden';
      if (m.still) continue;
      if (!active) { if (!m.el.paused) m.el.pause(); continue; }
      if (m.el.tagName === 'AUDIO') {
        const v = Math.max(0, Math.min(1, m.vol * (m.lane?.length ? laneAt(m.lane, t - m.start) : 1)));
        if (m.graph) { m.el.volume = 1; m.graph.level.gain.value = v; for (const l of m.graph.lanes) l.set(laneAt(l.points, t - m.start)); }
        else m.el.volume = v;
      }
      const target = m.from + (t - m.start) * m.rate;
      m.el.playbackRate = m.rate;
      if (playing) {
        if (m.el.paused) { m.el.currentTime = target; m.el.play().catch(() => {}); }
        else if (Math.abs(m.el.currentTime - target) > 0.2) m.el.currentTime = target;
      } else {
        if (!m.el.paused) m.el.pause();
        if (exact || Math.abs(m.el.currentTime - target) > 0.01) m.el.currentTime = target;
      }
    }
  }
  function seek(x) {
    t = Math.max(0, Math.min(DUR, x));
    tl.seek(t, false);
    sync(true);
    emit();
  }
  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    t += dt;
    const stop = loopEnd ?? DUR;
    if (t >= stop) { t = stop; tl.seek(t, false); pause(); return; }
    tl.seek(t, false);
    sync(false);
    emit();
    raf = requestAnimationFrame(tick);
  }
  function play(until) {
    if (playing) return;
    if (t >= DUR - 0.01) t = 0;
    loopEnd = until ?? null;
    playing = true; last = performance.now();
    // Web Audio needs a user gesture: build the effect graphs on the first play and wake the context.
    media.forEach(m => { if (m.el.tagName === 'AUDIO' && m.el.dataset.fxChain) wireFx(m); });
    ctx?.resume?.().catch(() => {});
    sync(true);
    emit();
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; cancelAnimationFrame(raf);
    sync(true);
    emit();
  }

  tl.seek(0, false);
  window.__player = {
    id, duration: DUR, seek, play, pause,
    get time() { return t; }, get playing() { return playing; },
    // For debugging: the live values of every wired effect node (gain in dB for filters).
    fx: () => media.filter(m => m.graph).map(m => ({ el: m.el.id, level: +m.graph.level.gain.value.toFixed(3), nodes: m.nodes.map(({ id, node }) => ({ id, gain: +(node.gain.value ?? 0).toFixed(2) })) })),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
