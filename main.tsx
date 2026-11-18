import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface WavePreset {
  id: "alpha" | "theta" | "delta";
  name: string;
  beatHz: number; // binaural frequency difference
  carrierHz: number; // base tone frequency
  rangeText: string;
  description: string;
  brainState: string;
}

const PRESETS: WavePreset[] = [
  {
    id: "alpha",
    name: "Alpha Waves",
    beatHz: 10,
    carrierHz: 216,
    rangeText: "8 – 12 Hz",
    description: "Light relaxation, peaceful mind & pre-sleep calm",
    brainState: "Calm Reflection"
  },
  {
    id: "theta",
    name: "Theta Waves",
    beatHz: 6,
    carrierHz: 194.18,
    rangeText: "4 – 8 Hz",
    description: "Deep meditation, twilight dreaminess & sleep onset",
    brainState: "Deep Sleep Entry"
  },
  {
    id: "delta",
    name: "Delta Waves",
    beatHz: 2.5,
    carrierHz: 136.1,
    rangeText: "0.5 – 4 Hz",
    description: "Restorative deep slumber & cellular renewal",
    brainState: "Deep Restorative"
  }
];

// Loop point fix: the generated buffer is `length + fade` samples long. The last `fade`
// samples are blended into the start, so playback wraps without a click.
function makeSeamless(ctx: AudioContext, channels: Float32Array[], length: number, fade: number) {
  const buffer = ctx.createBuffer(channels.length, length, ctx.sampleRate);
  channels.forEach((raw, c) => {
    const out = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      if (i < fade) {
        const w = i / fade;
        out[i] = raw[i] * w + raw[length + i] * (1 - w);
      } else {
        out[i] = raw[i];
      }
    }
  });
  return buffer;
}

const MIDNIGHT = "#14172B";
const DISPLAY = "Gloock, Georgia, serif";
const SANS = "'Familjen Grotesk', system-ui, sans-serif";

interface Layer {
  id: string;
  name: string;
  volume: number; // 0 to 1
  set: (value: number) => void;
  fill: string;
  ink: string;
}

const BAND_MIN = 48; // px a layer keeps at zero volume, so its seam stays reachable

// The core sample: layers stack from the ground up. A layer's thickness is its volume;
// dragging its top seam makes it thicker (louder) or thinner (quieter).
function Strata({
  layers,
  beatHz,
  binauralVolume,
  isPlaying
}: {
  layers: Layer[];
  beatHz: number;
  binauralVolume: number;
  isPlaying: boolean;
}) {
  const coreRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLCanvasElement | null>(null);
  const [height, setHeight] = useState(360);
  const drag = useRef<{ id: string; startY: number; startVol: number } | null>(null);

  useEffect(() => {
    const el = coreRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pixels of thickness that one full unit of volume adds to a band
  const span = Math.max(40, (height - BAND_MIN * layers.length) / layers.length);

  // The binaural tone: one thin line threading down through every layer, moving at the beat rate
  useEffect(() => {
    const canvas = lineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    let phase = 0;
    let raf = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (isPlaying && !reduced) phase += beatHz * 0.03;
      const amp = (isPlaying ? 4 + binauralVolume * 10 : 1) * dpr;
      ctx.strokeStyle = isPlaying ? "rgba(216, 212, 196, 0.9)" : "rgba(216, 212, 196, 0.35)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 3) {
        const x = w * 0.86 + Math.sin(y / (26 * dpr) - phase) * amp;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, beatHz, binauralVolume, height]);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  return (
    <div ref={coreRef} className={`core relative flex flex-col justify-end overflow-hidden ${isPlaying ? "is-playing" : ""}`}>
      {layers.map((layer) => {
        const pct = Math.round(layer.volume * 100);
        return (
          <div
            key={layer.id}
            className="relative shrink-0"
            style={{ height: BAND_MIN + layer.volume * span, background: layer.fill, color: layer.ink }}
          >
            <div className={`tex tex-${layer.id}`} style={{ opacity: 0.2 + layer.volume * 0.8 }} />
            <div className="relative flex items-baseline gap-3 px-4 pt-4">
              <span className="text-xl leading-none" style={{ fontFamily: DISPLAY }}>{layer.name}</span>
              <span className="text-sm tabular-nums opacity-80">{pct}%</span>
            </div>
            {/* Seam: the draggable top edge of this layer */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={`${layer.name} volume`}
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${pct}%`}
              className="seam"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { id: layer.id, startY: e.clientY, startVol: layer.volume };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== layer.id) return;
                layer.set(clamp(d.startVol + (d.startY - e.clientY) / span));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.02;
                if (e.key === "ArrowUp" || e.key === "ArrowRight") layer.set(clamp(layer.volume + step));
                else if (e.key === "ArrowDown" || e.key === "ArrowLeft") layer.set(clamp(layer.volume - step));
                else return;
                e.preventDefault();
              }}
            >
              <span className="seam-grip" />
            </div>
          </div>
        );
      })}
      <canvas ref={lineRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
    </div>
  );
}

// Labelled slider with a numeric readout and optional scale hints
function Control({
  label,
  readout,
  min,
  max,
  step,
  value,
  onChange,
  hints
}: {
  label: string;
  readout: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  hints?: string[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-base text-[#D8D4C4]">{label}</span>
        <span className="text-base tabular-nums text-[#A0A2B8]">{readout}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-3 w-full h-1 cursor-pointer accent-[#D8D4C4]"
      />
      {hints && (
        <div className="mt-2 flex justify-between text-sm text-[#A0A2B8]">
          {hints.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Component() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<WavePreset>(PRESETS[1]); // Default Theta
  const [customBeatHz, setCustomBeatHz] = useState<number>(PRESETS[1].beatHz);
  const [carrierHz, setCarrierHz] = useState<number>(PRESETS[1].carrierHz);

  // Layer volumes (0 to 1)
  const [binauralVolume, setBinauralVolume] = useState(0.65);
  const [rainVolume, setRainVolume] = useState(0.35);
  const [pinkNoiseVolume, setPinkNoiseVolume] = useState(0.2);
  const [droneVolume, setDroneVolume] = useState(0.35);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [dimScreen, setDimScreen] = useState(false);

  // Audio nodes and context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Binaural nodes
  const leftOscRef = useRef<OscillatorNode | null>(null);
  const rightOscRef = useRef<OscillatorNode | null>(null);
  const binauralGainRef = useRef<GainNode | null>(null);

  // Drone nodes
  const droneOsc1Ref = useRef<OscillatorNode | null>(null);
  const droneOsc2Ref = useRef<OscillatorNode | null>(null);
  const droneOsc3Ref = useRef<OscillatorNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);

  // Noise nodes
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainRef = useRef<GainNode | null>(null);

  // Rain nodes
  const rainSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rainGainRef = useRef<GainNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Keep latest volume / settings in refs for lookups
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Initialize or resume audio context
  const getOrCreateAudioContext = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      // Soft limiter on the master bus: keeps summed layers below full scale so they don't distort
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      masterGain.connect(limiter);
      limiter.connect(analyser);
      analyser.connect(ctx.destination);
      masterGainRef.current = masterGain;
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Build Pink Noise Buffer (soft soothing frequency decay)
  const createPinkNoiseBuffer = (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 5; // 5 seconds looped
    const fade = Math.floor(ctx.sampleRate * 0.5); // 0.5 s crossfade hides the loop point
    const output = new Float32Array(bufferSize + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < output.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }
    return makeSeamless(ctx, [output], bufferSize, fade);
  };

  // Build Procedural Soft Rain Buffer (filtered noise with droplet impulses)
  const createRainBuffer = (ctx: AudioContext) => {
    const duration = 6; // 6 second loopable texture
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const fade = Math.floor(sampleRate * 0.5); // 0.5 s crossfade hides the loop point
    const left = new Float32Array(length + fade);
    const right = new Float32Array(length + fade);

    // Multi-pole brownian/pink noise bed for patter
    let lastL = 0;
    let lastR = 0;
    // Raindrop state: each drop is a smooth 10 ms pulse, not a hard step
    const DROP_LEN = Math.floor(sampleRate * 0.01);
    let dropPos = DROP_LEN;
    let dropIntensity = 0;
    let dropGainR = 0;
    for (let i = 0; i < left.length; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;

      // Soft low-pass rumble
      lastL = (lastL + 0.025 * whiteL) / 1.025;
      lastR = (lastR + 0.025 * whiteR) / 1.025;

      let sampleL = lastL * 3.5;
      let sampleR = lastR * 3.5;

      // Random gentle raindrop impacts (Hann-shaped pulse, so no pop)
      if (dropPos >= DROP_LEN && Math.random() < 0.003) {
        dropIntensity = Math.random() * 0.15 + 0.05;
        dropGainR = dropIntensity * (Math.random() * 0.6 + 0.4);
        dropPos = 0;
      }
      if (dropPos < DROP_LEN) {
        const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * dropPos) / DROP_LEN);
        sampleL += dropIntensity * env;
        sampleR += dropGainR * env;
        dropPos++;
      }

      left[i] = sampleL * 0.4;
      right[i] = sampleR * 0.4;
    }
    return makeSeamless(ctx, [left, right], length, fade);
  };

  // Start all generators
  const startAudio = () => {
    const ctx = getOrCreateAudioContext();
    const now = ctx.currentTime;

    // 1. Binaural generator (Stereo split: Left = carrier, Right = carrier + beatHz)
    const binauralGain = ctx.createGain();
    binauralGain.gain.setValueAtTime(0, now);
    binauralGain.gain.linearRampToValueAtTime(binauralVolume, now + 1.5);
    binauralGain.connect(masterGainRef.current!);
    binauralGainRef.current = binauralGain;

    // Left Ear
    const merger = ctx.createChannelMerger(2);
    merger.connect(binauralGain);

    const leftOsc = ctx.createOscillator();
    leftOsc.type = "sine";
    leftOsc.frequency.setValueAtTime(carrierHz, now);
    const leftGain = ctx.createGain();
    leftGain.gain.value = 1.0;
    leftOsc.connect(leftGain);
    leftGain.connect(merger, 0, 0); // Output 0 to Left channel (input 0)

    // Right Ear
    const rightOsc = ctx.createOscillator();
    rightOsc.type = "sine";
    rightOsc.frequency.setValueAtTime(carrierHz + customBeatHz, now);
    const rightGain = ctx.createGain();
    rightGain.gain.value = 1.0;
    rightOsc.connect(rightGain);
    rightGain.connect(merger, 0, 1); // Output 0 to Right channel (input 1)

    leftOsc.start();
    rightOsc.start();
    leftOscRef.current = leftOsc;
    rightOscRef.current = rightOsc;

    // 2. Ultra-warm ambient harmonic drone (deep sub-bass, gentle detuning, gentle analog-style lowpass)
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(droneVolume * 0.55, now + 2.5);

    // Deep warm lowpass filter to remove any harshness or buzz
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(175, now);
    filter.Q.setValueAtTime(0.5, now);

    droneGain.connect(filter);
    filter.connect(masterGainRef.current!);
    droneGainRef.current = droneGain;

    // Sub foundation (one full octave down)
    const drone1 = ctx.createOscillator();
    drone1.type = "sine";
    drone1.frequency.setValueAtTime(carrierHz * 0.5, now);

    // Deep warm fifth (octave-and-a-fifth below, slightly detuned +0.6 Hz for warm chorusing)
    const drone2 = ctx.createOscillator();
    drone2.type = "sine";
    drone2.frequency.setValueAtTime(carrierHz * 0.375 + 0.6, now);

    // Gentle second sub harmonic (-0.6 Hz detuned for warm breathing motion)
    const drone3 = ctx.createOscillator();
    drone3.type = "sine";
    drone3.frequency.setValueAtTime(carrierHz * 0.5 - 0.6, now);

    drone1.connect(droneGain);
    drone2.connect(droneGain);
    drone3.connect(droneGain);

    drone1.start();
    drone2.start();
    drone3.start();
    droneOsc1Ref.current = drone1;
    droneOsc2Ref.current = drone2;
    droneOsc3Ref.current = drone3;

    // 3. Pink noise ambient bed (soft rain/air feeling)
    const noiseBuffer = createPinkNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(450, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(pinkNoiseVolume * 0.6, now + 2.0);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGainRef.current!);

    noiseSource.start();
    noiseSourceRef.current = noiseSource;
    noiseGainRef.current = noiseGain;

    // 4. Soft rain shower generator
    const rainBuffer = createRainBuffer(ctx);
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = rainBuffer;
    rainSource.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.setValueAtTime(1400, now);
    rainFilter.Q.setValueAtTime(0.7, now);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0, now);
    rainGain.gain.linearRampToValueAtTime(rainVolume * 0.8, now + 2.0);

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(masterGainRef.current!);

    rainSource.start();
    rainSourceRef.current = rainSource;
    rainGainRef.current = rainGain;

    setIsPlaying(true);
  };

  // Stop all audio smoothly
  const stopAudio = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    // Ramp down to prevent clicks
    if (masterGainRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(0.001, now + 0.8);
    }

    setTimeout(() => {
      try {
        leftOscRef.current?.stop();
        rightOscRef.current?.stop();
        droneOsc1Ref.current?.stop();
        droneOsc2Ref.current?.stop();
        droneOsc3Ref.current?.stop();
        noiseSourceRef.current?.stop();
        rainSourceRef.current?.stop();

        leftOscRef.current?.disconnect();
        rightOscRef.current?.disconnect();
        droneOsc1Ref.current?.disconnect();
        droneOsc2Ref.current?.disconnect();
        droneOsc3Ref.current?.disconnect();
        noiseSourceRef.current?.disconnect();
        rainSourceRef.current?.disconnect();
      } catch {
        // Safe tear down
      }

      leftOscRef.current = null;
      rightOscRef.current = null;
      droneOsc1Ref.current = null;
      droneOsc2Ref.current = null;
      droneOsc3Ref.current = null;
      noiseSourceRef.current = null;
      rainSourceRef.current = null;

      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setValueAtTime(masterVolume, audioCtxRef.current.currentTime);
      }
      setIsPlaying(false);
    }, 850);
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  // Android/mobile browsers suspend audio when the tab is backgrounded; resume on return
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Update frequencies live
  useEffect(() => {
    if (!isPlaying || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    if (leftOscRef.current) {
      leftOscRef.current.frequency.setTargetAtTime(carrierHz, now, 0.1);
    }
    if (rightOscRef.current) {
      rightOscRef.current.frequency.setTargetAtTime(carrierHz + customBeatHz, now, 0.1);
    }
    if (droneOsc1Ref.current) {
      droneOsc1Ref.current.frequency.setTargetAtTime(carrierHz * 0.5, now, 0.2);
    }
    if (droneOsc2Ref.current) {
      droneOsc2Ref.current.frequency.setTargetAtTime(carrierHz * 0.375 + 0.6, now, 0.2);
    }
    if (droneOsc3Ref.current) {
      droneOsc3Ref.current.frequency.setTargetAtTime(carrierHz * 0.5 - 0.6, now, 0.2);
    }
  }, [carrierHz, customBeatHz, isPlaying]);

  // Update volumes live
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    if (masterGainRef.current && isPlaying) {
      masterGainRef.current.gain.setTargetAtTime(masterVolume, now, 0.05);
    }
    if (binauralGainRef.current) {
      binauralGainRef.current.gain.setTargetAtTime(binauralVolume, now, 0.05);
    }
    if (droneGainRef.current) {
      droneGainRef.current.gain.setTargetAtTime(droneVolume * 0.5, now, 0.05);
    }
    if (noiseGainRef.current) {
      noiseGainRef.current.gain.setTargetAtTime(pinkNoiseVolume * 0.6, now, 0.05);
    }
    if (rainGainRef.current) {
      rainGainRef.current.gain.setTargetAtTime(rainVolume * 0.8, now, 0.05);
    }
  }, [masterVolume, binauralVolume, droneVolume, pinkNoiseVolume, rainVolume, isPlaying]);

  // Select preset
  const handleSelectPreset = (preset: WavePreset) => {
    setSelectedPreset(preset);
    setCustomBeatHz(preset.beatHz);
    setCarrierHz(preset.carrierHz);
  };

  // Sleep Timer countdown handler
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (timerMinutes && isPlaying) {
      setTimeRemaining(timerMinutes * 60);
      timerIntervalRef.current = window.setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timerIntervalRef.current!);
            timerIntervalRef.current = null;
            stopAudio();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeRemaining(null);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [timerMinutes, isPlaying]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Layers listed top to bottom, as they stack in the core
  const layers: Layer[] = [
    { id: "rain", name: "Rain", volume: rainVolume, set: setRainVolume, fill: "#2E4A52", ink: "#D8D4C4" },
    { id: "air", name: "Air", volume: pinkNoiseVolume, set: setPinkNoiseVolume, fill: "#4A3F34", ink: "#D8D4C4" },
    { id: "drone", name: "Drone", volume: droneVolume, set: setDroneVolume, fill: "#8E9A63", ink: "#14172B" }
  ];

  return (
    <div className="min-h-screen w-full text-[#D8D4C4]" style={{ background: MIDNIGHT, fontFamily: SANS }}>
      {/* Dimmed screen: black, shows only the sleep timer; tap anywhere to exit */}
      {dimScreen && (
        <div
          onClick={() => setDimScreen(false)}
          role="button"
          aria-label="Exit dimmed screen"
          className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
        >
          {timeRemaining !== null && (
            <span className="text-4xl tabular-nums text-[#3E4158]" style={{ fontFamily: DISPLAY }}>
              {formatTimer(timeRemaining)}
            </span>
          )}
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-10 sm:py-10 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-20 lg:gap-y-8 lg:items-start">
        {/* Current state */}
        <section className="lg:col-start-2 lg:row-start-1">
          <p className="flex items-baseline justify-between text-sm text-[#A0A2B8]">
            <span>Sleep Soundscape</span>
            <span>Best with headphones</span>
          </p>
          <h1 className="mt-6 text-6xl sm:text-7xl leading-none" style={{ fontFamily: DISPLAY }}>
            {selectedPreset.name.replace(" Waves", "")}
          </h1>
          <p className="mt-4 text-base text-[#A0A2B8] tabular-nums">
            {customBeatHz.toFixed(1)} Hz beat on a {Math.round(carrierHz)} Hz tone
          </p>
          <p className="mt-1 max-w-[34ch] text-base leading-snug text-[#D8D4C4]">{selectedPreset.description}</p>
        </section>

        {/* The core: drag a seam to set that layer's volume */}
        <section className="mt-8 lg:mt-0 lg:col-start-1 lg:row-start-1 lg:row-span-2" aria-label="Sound mix">
          <Strata layers={layers} beatHz={customBeatHz} binauralVolume={binauralVolume} isPlaying={isPlaying} />
          <p className="mt-3 text-sm text-[#A0A2B8]">Drag a seam up or down to change a layer's volume.</p>
        </section>

        {/* Controls */}
        <section className="mt-8 lg:mt-0 lg:col-start-2 lg:row-start-2 space-y-7">
          <div role="group" aria-label="Brainwave state" className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const active = selectedPreset.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  aria-pressed={active}
                  className="text-left rounded-sm px-3 py-3 transition-colors"
                  style={{
                    background: active ? "#232850" : "transparent",
                    color: active ? "#D8D4C4" : "#A0A2B8",
                    boxShadow: active ? "inset 0 0 0 1px #3A4080" : "inset 0 0 0 1px #262A4A"
                  }}
                >
                  <span className="block text-xl leading-tight" style={{ fontFamily: DISPLAY }}>
                    {p.name.replace(" Waves", "")}
                  </span>
                  <span className="block mt-1 text-sm tabular-nums whitespace-nowrap">{p.rangeText}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            <span className="mr-1">Stop after</span>
            {[null, 15, 30, 60].map((mins) => {
              const active = timerMinutes === mins;
              return (
                <button
                  key={mins === null ? "off" : mins}
                  onClick={() => setTimerMinutes(mins)}
                  aria-pressed={active}
                  className="min-h-11 px-3 tabular-nums"
                  style={{
                    color: active ? MIDNIGHT : "#A0A2B8",
                    background: active ? "#D8D4C4" : "transparent",
                    borderRadius: 2
                  }}
                >
                  {mins === null ? "Never" : `${mins} min`}
                </button>
              );
            })}
            {timeRemaining !== null && (
              <span className="w-full text-[#A0A2B8] tabular-nums">Stops in {formatTimer(timeRemaining)}</span>
            )}
          </div>

          <button
            onClick={togglePlay}
            className="w-full py-4 text-2xl transition-opacity hover:opacity-90"
            style={{ background: "#D8D4C4", color: MIDNIGHT, fontFamily: DISPLAY, borderRadius: 2 }}
          >
            <span className="inline-flex items-center gap-3">
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              {isPlaying ? "Pause" : "Begin"}
            </span>
          </button>

          <details>
            <summary className="cursor-pointer min-h-11 flex items-center text-base text-[#A0A2B8] hover:text-[#D8D4C4]">
              Fine-tune
            </summary>
            <div className="mt-4 space-y-6">
              <Control
                label="Beat"
                readout={`${customBeatHz.toFixed(1)} Hz`}
                min={0.5}
                max={15}
                step={0.1}
                value={customBeatHz}
                onChange={setCustomBeatHz}
                hints={["0.5 delta", "6 theta", "12 alpha"]}
              />
              <Control
                label="Carrier pitch"
                readout={`${Math.round(carrierHz)} Hz`}
                min={100}
                max={432}
                step={1}
                value={carrierHz}
                onChange={setCarrierHz}
                hints={["100", "216", "432"]}
              />
              <Control
                label="Pure tone"
                readout={`${Math.round(binauralVolume * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={binauralVolume}
                onChange={setBinauralVolume}
              />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-base">Master volume</span>
                  <button
                    onClick={() => setMasterVolume((prev) => (prev > 0 ? 0 : 0.8))}
                    className="min-w-11 min-h-11 flex items-center justify-center text-[#A0A2B8] hover:text-[#D8D4C4]"
                    aria-label={masterVolume === 0 ? "Unmute" : "Mute"}
                  >
                    {masterVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
                <input
                  type="range"
                  aria-label="Master volume"
                  min="0"
                  max="1"
                  step="0.01"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="w-full h-1 cursor-pointer accent-[#D8D4C4]"
                />
              </div>
            </div>
          </details>

          <button
            onClick={() => setDimScreen(true)}
            className="min-h-11 text-base text-[#A0A2B8] hover:text-[#D8D4C4] underline underline-offset-4"
          >
            Dim screen
          </button>
        </section>
      </main>
    </div>
  );
}
