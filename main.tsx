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

const SERIF = "Fraunces, Georgia, serif";

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
        <label className="text-sm text-[#E9E2D4]">{label}</label>
        <span className="font-mono text-xs tabular-nums text-[#8A8175]">{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-3 w-full h-1 cursor-pointer accent-[#D9A441]"
      />
      {hints && (
        <div className="mt-2 flex justify-between font-mono text-[10px] text-[#5E574E]">
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

  // Visualizer canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
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
      masterGain.connect(analyser);
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
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
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
    return buffer;
  };

  // Build Procedural Soft Rain Buffer (filtered noise with droplet impulses)
  const createRainBuffer = (ctx: AudioContext) => {
    const duration = 6; // 6 second loopable texture
    const sampleRate = ctx.sampleRate;
    const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Multi-pole brownian/pink noise bed for patter
    let lastL = 0;
    let lastR = 0;
    for (let i = 0; i < buffer.length; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;

      // Soft low-pass rumble
      lastL = (lastL + 0.025 * whiteL) / 1.025;
      lastR = (lastR + 0.025 * whiteR) / 1.025;

      let sampleL = lastL * 3.5;
      let sampleR = lastR * 3.5;

      // Random gentle raindrop impacts
      if (Math.random() < 0.003) {
        const dropIntensity = (Math.random() * 0.15 + 0.05);
        sampleL += dropIntensity;
        sampleR += dropIntensity * (Math.random() * 0.6 + 0.4);
      }

      left[i] = sampleL * 0.4;
      right[i] = sampleR * 0.4;
    }
    return buffer;
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

  // Canvas visualizer: one thin line that moves at the beat rate, nearly flat when stopped
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Hairline baseline
      ctx.strokeStyle = "rgba(233, 226, 212, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      phase += isPlaying ? customBeatHz * 0.03 : 0.004;
      const amplitude = isPlaying ? height * 0.32 : height * 0.04;

      ctx.strokeStyle = isPlaying ? "rgba(217, 164, 65, 0.9)" : "rgba(233, 226, 212, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const normX = x / width;
        // Envelope pinned to both ends so the line settles at the edges
        const y = height / 2 + Math.sin(normX * Math.PI * 4 + phase) * amplitude * Math.sin(normX * Math.PI);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPlaying, customBeatHz]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#0E0D0B] text-[#E9E2D4] flex items-center justify-center p-5 sm:p-10">
      <main className="w-full max-w-xl">
        {/* Header */}
        <header className="flex items-baseline justify-between gap-4 pb-5 border-b border-[#2A2620]">
          <h1 className="text-2xl text-[#F3ECDD]" style={{ fontFamily: SERIF }}>
            Sleep Soundscape
          </h1>
          <p className="hidden sm:block text-xs text-[#8A8175]">Best with headphones</p>
        </header>

        {/* Signal */}
        <section className="py-6 border-b border-[#2A2620]">
          <canvas ref={canvasRef} width={640} height={120} className="w-full h-24" />
          <div className="mt-3 flex items-center justify-between font-mono text-xs tabular-nums text-[#8A8175]">
            <span>
              Beat <span className="text-[#E9E2D4]">{customBeatHz.toFixed(1)} Hz</span>
              {" · "}
              Carrier <span className="text-[#E9E2D4]">{Math.round(carrierHz)} Hz</span>
            </span>
            {timeRemaining !== null && <span>Stops in {formatTimer(timeRemaining)}</span>}
          </div>
        </section>

        {/* Brainwave state */}
        <section className="py-6 border-b border-[#2A2620]">
          <h2 className="mb-3 text-sm text-[#8A8175] italic" style={{ fontFamily: SERIF }}>
            Brainwave state
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#2A2620] border border-[#2A2620]">
            {PRESETS.map((p) => {
              const active = selectedPreset.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-4 bg-[#0E0D0B] transition-colors ${
                    active
                      ? "text-[#F3ECDD] shadow-[inset_0_2px_0_#D9A441]"
                      : "text-[#8A8175] hover:text-[#E9E2D4]"
                  }`}
                >
                  <span className="block text-base whitespace-nowrap" style={{ fontFamily: SERIF }}>{p.name}</span>
                  <span className="block mt-0.5 font-mono text-[11px] tabular-nums whitespace-nowrap">{p.rangeText}</span>
                  <p className="mt-2 text-xs leading-relaxed">{p.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tuning */}
        <section className="py-6 border-b border-[#2A2620] space-y-6">
          <h2 className="text-sm text-[#8A8175] italic" style={{ fontFamily: SERIF }}>
            Tuning
          </h2>
          <Control
            label="Binaural beat"
            readout={`${customBeatHz.toFixed(1)} Hz`}
            min={0.5}
            max={15}
            step={0.1}
            value={customBeatHz}
            onChange={setCustomBeatHz}
            hints={["0.5 Hz delta", "6 Hz theta", "12 Hz alpha"]}
          />
          <Control
            label="Carrier pitch"
            readout={`${Math.round(carrierHz)} Hz`}
            min={100}
            max={432}
            step={1}
            value={carrierHz}
            onChange={setCarrierHz}
            hints={["100 Hz", "216 Hz", "432 Hz"]}
          />
        </section>

        {/* Mixer */}
        <section className="py-6 border-b border-[#2A2620] space-y-6">
          <h2 className="text-sm text-[#8A8175] italic" style={{ fontFamily: SERIF }}>
            Mixer
          </h2>
          <Control
            label="Pure binaural tones"
            readout={`${Math.round(binauralVolume * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={binauralVolume}
            onChange={setBinauralVolume}
          />
          <Control
            label="Harmonic drone"
            readout={`${Math.round(droneVolume * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={droneVolume}
            onChange={setDroneVolume}
          />
          <Control
            label="Soft rain"
            readout={`${Math.round(rainVolume * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={rainVolume}
            onChange={setRainVolume}
          />
          <Control
            label="Air / static"
            readout={`${Math.round(pinkNoiseVolume * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            value={pinkNoiseVolume}
            onChange={setPinkNoiseVolume}
          />
        </section>

        {/* Master, timer, play */}
        <section className="pt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-xs text-[#8A8175]">
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <button
                onClick={() => setMasterVolume((prev) => (prev > 0 ? 0 : 0.8))}
                className="hover:text-[#E9E2D4] transition-colors"
                aria-label="Mute or unmute"
              >
                {masterVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-40 h-1 cursor-pointer accent-[#E9E2D4]"
              />
            </div>

            <div className="flex items-center gap-3">
              <span>Timer</span>
              {[null, 15, 30, 60].map((mins) => (
                <button
                  key={mins === null ? "off" : mins}
                  onClick={() => setTimerMinutes(mins)}
                  className={`font-mono py-2 px-1 transition-colors ${
                    timerMinutes === mins
                      ? "text-[#D9A441] underline underline-offset-4"
                      : "hover:text-[#E9E2D4]"
                  }`}
                >
                  {mins === null ? "off" : `${mins}m`}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={togglePlay}
            className="w-full py-3 border border-[#D9A441] text-[#D9A441] text-sm tracking-wide hover:bg-[#D9A441] hover:text-[#0E0D0B] transition-colors"
            style={{ fontFamily: SERIF }}
          >
            {isPlaying ? (
              <span className="inline-flex items-center gap-2">
                <Pause className="w-4 h-4 fill-current" /> Pause
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" /> Begin
              </span>
            )}
          </button>
        </section>
      </main>
    </div>
  );
}
