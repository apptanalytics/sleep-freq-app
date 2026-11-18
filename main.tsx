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

// The two carriers, one per ear. Their phase gap opens and closes at the beat rate.
function Waves({ beatHz, isPlaying }: { beatHz: number; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ beatHz, isPlaying });
  live.current = { beatHz, isPlaying };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let left = 0;
    let right = 0.9;
    let raf = 0;
    const draw = () => {
      const { beatHz: beat, isPlaying: playing } = live.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (playing && !reduced) {
        left += 0.02;
        right += 0.02 + beat * 0.008;
      }
      const mid = h / 2;
      const amp = h * 0.36;
      const k = (Math.PI * 2 * 4) / w;
      const step = 3 * dpr;

      // The gap between the ears: wide where the waves oppose, closed where they agree
      ctx.strokeStyle = playing ? "rgba(255, 106, 61, 0.2)" : "rgba(255, 106, 61, 0.08)";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, mid + Math.sin(k * x - left) * amp);
        ctx.lineTo(x, mid + Math.sin(k * x - right) * amp);
      }
      ctx.stroke();

      const trace = (phase: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        for (let x = 0; x <= w; x += dpr * 2) {
          const y = mid + Math.sin(k * x - phase) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      trace(left, "#9A3220");
      trace(right, playing ? "#FF6A3D" : "#D24E33");

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="block w-full h-28" aria-hidden="true" />;
}

// Level control drawn as a row of exposure ticks. A transparent range input sits on top,
// so touch, mouse and keyboard all work natively.
function Meter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-base">
        <span className="text-[var(--hot)]">{label}</span>
        <span className="tabular-nums text-[var(--ember)]">{pct}%</span>
      </div>
      <div className="meter" style={{ "--v": `${pct}%` } as React.CSSProperties}>
        <input
          type="range"
          aria-label={label}
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

// Labelled slider with a numeric readout
function Control({
  label,
  readout,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string;
  readout: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-base">
        <span className="text-[var(--hot)]">{label}</span>
        <span className="tabular-nums text-[var(--ember)]">{readout}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="scrub"
      />
    </div>
  );
}

const BEAT_MIN = 0.5;
const BEAT_MAX = 15;
const beatPercent = (hz: number) => ((hz - BEAT_MIN) / (BEAT_MAX - BEAT_MIN)) * 100;

export default function Component() {
  const [isPlaying, setIsPlaying] = useState(false);
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

  // The state follows the beat, so dragging the scrubber renames it live
  const activePreset = customBeatHz < 4 ? PRESETS[2] : customBeatHz < 8 ? PRESETS[1] : PRESETS[0];
  const stateName = activePreset.name.replace(" Waves", "");

  const clock =
    timeRemaining !== null ? formatTimer(timeRemaining) : timerMinutes !== null ? `${timerMinutes}:00` : "Off";

  return (
    <div className="min-h-screen w-full text-[var(--hot)] safelight">
      {/* Dimmed screen: black, shows only the sleep timer; tap anywhere to exit */}
      {dimScreen && (
        <div
          onClick={() => setDimScreen(false)}
          role="button"
          aria-label="Exit dimmed screen"
          className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
        >
          {timeRemaining !== null && (
            <span className="clock text-6xl tabular-nums text-[#5A1E14]">{formatTimer(timeRemaining)}</span>
          )}
        </div>
      )}

      <main className="mx-auto w-full max-w-xl px-5 pt-6 sm:px-8 sm:pt-10">
        <p className="flex items-baseline justify-between text-sm text-[var(--ember)]">
          <span>Sleep Soundscape</span>
          <span>Best with headphones</span>
        </p>

        {/* State */}
        <section className="mt-8 overflow-hidden">
          <h1 className={`hero-name ${isPlaying ? "is-playing" : ""}`}>{stateName}</h1>
          <p className="mt-3 text-2xl tabular-nums">
            {customBeatHz.toFixed(1)} Hz
            <span className="ml-3 text-base text-[var(--ember)]">between your ears</span>
          </p>
          <p className="mt-2 max-w-[36ch] text-base leading-snug text-[var(--ember)]">{activePreset.description}</p>
        </section>

        {/* Waves */}
        <section className="mt-8" aria-label="Left and right ear tones">
          <Waves beatHz={customBeatHz} isPlaying={isPlaying} />
          <p className="mt-2 flex justify-between text-sm tabular-nums text-[var(--ember)]">
            <span>Left ear {carrierHz.toFixed(0)} Hz</span>
            <span>Right ear {(carrierHz + customBeatHz).toFixed(0)} Hz</span>
          </p>
        </section>

        {/* Beat scrubber with the three states marked on it */}
        <section className="mt-6" aria-label="Brainwave state">
          <input
            type="range"
            aria-label="Beat frequency"
            aria-valuetext={`${customBeatHz.toFixed(1)} hertz, ${stateName}`}
            min={BEAT_MIN}
            max={BEAT_MAX}
            step={0.1}
            value={customBeatHz}
            onChange={(e) => setCustomBeatHz(parseFloat(e.target.value))}
            className="scrub"
          />
          <div className="relative h-11">
            {[PRESETS[2], PRESETS[1], PRESETS[0]].map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`state-mark ${activePreset.id === p.id ? "is-active" : ""}`}
                style={{ left: `${beatPercent(p.beatHz)}%` }}
              >
                {p.name.replace(" Waves", "")}
              </button>
            ))}
          </div>
        </section>

        {/* Mix */}
        <section className="mt-8 space-y-5" aria-label="Mix">
          <Meter label="Rain" value={rainVolume} onChange={setRainVolume} />
          <Meter label="Air" value={pinkNoiseVolume} onChange={setPinkNoiseVolume} />
          <Meter label="Drone" value={droneVolume} onChange={setDroneVolume} />
          <Meter label="Pure tone" value={binauralVolume} onChange={setBinauralVolume} />
        </section>

        {/* Timer length */}
        <section className="mt-8 flex flex-wrap items-center gap-x-1 text-base">
          <span className="mr-1 text-[var(--ember)]">Stop after</span>
          {[null, 15, 30, 60].map((mins) => (
            <button
              key={mins === null ? "off" : mins}
              onClick={() => setTimerMinutes(mins)}
              aria-pressed={timerMinutes === mins}
              className={`opt ${timerMinutes === mins ? "is-active" : ""}`}
            >
              {mins === null ? "Never" : `${mins} min`}
            </button>
          ))}
        </section>

        <details className="mt-4">
          <summary className="cursor-pointer min-h-11 flex items-center text-base text-[var(--ember)] hover:text-[var(--hot)]">
            Fine-tune
          </summary>
          <div className="mt-3 space-y-6">
            <Control
              label="Carrier pitch"
              readout={`${Math.round(carrierHz)} Hz`}
              min={100}
              max={432}
              step={1}
              value={carrierHz}
              onChange={setCarrierHz}
            />
            <div>
              <div className="flex items-center justify-between">
                <span className="text-base">Master volume</span>
                <button
                  onClick={() => setMasterVolume((prev) => (prev > 0 ? 0 : 0.8))}
                  className="min-w-11 min-h-11 flex items-center justify-center text-[var(--ember)] hover:text-[var(--hot)]"
                  aria-label={masterVolume === 0 ? "Unmute" : "Mute"}
                >
                  {masterVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>
              <div className="meter" style={{ "--v": `${Math.round(masterVolume * 100)}%` } as React.CSSProperties}>
                <input
                  type="range"
                  aria-label="Master volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>
        </details>

        <button
          onClick={() => setDimScreen(true)}
          className="mt-2 min-h-11 text-base text-[var(--ember)] hover:text-[var(--hot)] underline underline-offset-4"
        >
          Dim screen
        </button>

        {/* Thumb zone: the clock and the main action stay within reach */}
        <div className="dock sticky bottom-0 mt-6 -mx-5 sm:-mx-8 px-5 sm:px-8 pt-4 flex items-center gap-5">
          <span
            className={`clock text-5xl tabular-nums ${timeRemaining !== null ? "text-[var(--hot)]" : "text-[var(--dim)]"}`}
            aria-label={timeRemaining !== null ? `Stops in ${clock}` : "Timer"}
          >
            {clock}
          </span>
          <button onClick={togglePlay} className="begin flex-1">
            <span className="inline-flex items-center justify-center gap-3">
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              {isPlaying ? "Pause" : "Begin"}
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}
