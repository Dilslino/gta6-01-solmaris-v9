// Synthesized WebAudio sound: no audio files, everything is generated.
// Engine hum, siren, gunshots, pickups and crashes, behind one master gain
// so the mute toggle (M) always works.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: two-tone square wave, LFO flips it.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  return {
    get started() {
      return started;
    },
    get running() {
      return !!ctx && ctx.state === 'running';
    },
    get muted() {
      return muted;
    },
    unlock() {
      resume();
    },
    setMuted(value) {
      muted = !!value;
      if (master && ctx) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    toggleMute() {
      return this.setMuted(!muted);
    },
    setEngine(speed01, driving) {
      if (!ctx || !engineOsc) return;
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = driving ? 0.05 + speed01 * 0.09 : 0.02;
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.value = on && !muted ? 0.035 : 0;
    },
    gunshot() {
      resume();
      noiseBurst(0.14, 0.5, 2400);
      blip(160, 0.08, 'square', 0.25);
    },
    hit() {
      blip(220, 0.1, 'triangle', 0.3);
    },
    pickup() {
      resume();
      blip(660, 0.12, 'sine', 0.35);
      blip(880, 0.14, 'sine', 0.35, 0.09);
      blip(1320, 0.2, 'sine', 0.3, 0.18);
    },
    crash() {
      noiseBurst(0.25, 0.5, 700);
      blip(70, 0.25, 'sine', 0.5);
    },
    wasted() {
      blip(330, 0.5, 'sawtooth', 0.25);
      blip(220, 0.7, 'sawtooth', 0.25, 0.35);
      blip(165, 1.0, 'sawtooth', 0.25, 0.7);
    },
    missionDone() {
      blip(523, 0.15, 'sine', 0.35);
      blip(659, 0.15, 'sine', 0.35, 0.12);
      blip(784, 0.3, 'sine', 0.35, 0.24);
    },
  };
}
