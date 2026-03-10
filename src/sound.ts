import type { AudioMixId, PlaneId } from "./config";

interface ShotProfile {
  primaryType: OscillatorType;
  secondaryType: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  secondaryStartFrequency: number;
  secondaryEndFrequency: number;
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ: number;
  gain: number;
  duration: number;
}

interface ResolvedShotProfile extends ShotProfile {
  detuneCents: number;
}

const SHOT_VARIATION_PATTERN = [-26, 0, 18];

const PLAYER_SHOT_PROFILES: Record<PlaneId, ShotProfile> = {
  falcon: {
    primaryType: "square",
    secondaryType: "sawtooth",
    startFrequency: 1120,
    endFrequency: 320,
    secondaryStartFrequency: 620,
    secondaryEndFrequency: 210,
    filterType: "bandpass",
    filterFrequency: 1750,
    filterQ: 4.2,
    gain: 0.04,
    duration: 0.11
  },
  titan: {
    primaryType: "sawtooth",
    secondaryType: "triangle",
    startFrequency: 620,
    endFrequency: 150,
    secondaryStartFrequency: 310,
    secondaryEndFrequency: 90,
    filterType: "lowpass",
    filterFrequency: 980,
    filterQ: 1.4,
    gain: 0.052,
    duration: 0.16
  },
  wraith: {
    primaryType: "square",
    secondaryType: "square",
    startFrequency: 1380,
    endFrequency: 460,
    secondaryStartFrequency: 720,
    secondaryEndFrequency: 240,
    filterType: "bandpass",
    filterFrequency: 2100,
    filterQ: 5.2,
    gain: 0.034,
    duration: 0.09
  }
};

const ENEMY_SHOT_PROFILE: ShotProfile = {
  primaryType: "triangle",
  secondaryType: "sawtooth",
  startFrequency: 420,
  endFrequency: 180,
  secondaryStartFrequency: 240,
  secondaryEndFrequency: 110,
  filterType: "lowpass",
  filterFrequency: 760,
  filterQ: 1.2,
  gain: 0.028,
  duration: 0.14
};

export function resolvePlayerShotProfile(planeId: PlaneId, shotIndex: number): ResolvedShotProfile {
  return {
    ...PLAYER_SHOT_PROFILES[planeId],
    detuneCents: SHOT_VARIATION_PATTERN[shotIndex % SHOT_VARIATION_PATTERN.length]
  };
}

export function resolveEnemyShotProfile(shotIndex: number): ResolvedShotProfile {
  return {
    ...ENEMY_SHOT_PROFILE,
    detuneCents: SHOT_VARIATION_PATTERN[shotIndex % SHOT_VARIATION_PATTERN.length] - 12
  };
}

export class SoundController {
  private audioContext: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private playerShotCount = 0;
  private enemyShotCount = 0;
  private audioMix: AudioMixId = "full";

  setAudioMix(audioMix: AudioMixId): void {
    this.audioMix = audioMix;
  }

  async unlock(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.noiseBuffer = this.createNoiseBuffer(this.audioContext);
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  playPlayerShot(planeId: PlaneId): void {
    this.playShot(resolvePlayerShotProfile(planeId, this.playerShotCount));
    this.playerShotCount += 1;
  }

  playEnemyShot(): void {
    this.playShot(resolveEnemyShotProfile(this.enemyShotCount));
    this.enemyShotCount += 1;
  }

  playHit(): void {
    this.playTone(180, 0.1, "triangle", 0.03, 95);
  }

  playExplosion(): void {
    if (!this.audioContext || !this.noiseBuffer) {
      return;
    }
    const mixGainScale = this.getMixGainScale();
    if (mixGainScale === 0) {
      return;
    }
    const now = this.audioContext.currentTime;
    const noise = this.audioContext.createBufferSource();
    const noiseFilter = this.audioContext.createBiquadFilter();
    const noiseGain = this.audioContext.createGain();
    const oscillator = this.audioContext.createOscillator();
    const toneGain = this.audioContext.createGain();

    noise.buffer = this.noiseBuffer;
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(900, now);
    noiseGain.gain.setValueAtTime(0.05 * mixGainScale, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(140, now);
    oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.24);
    toneGain.gain.setValueAtTime(0.03 * mixGainScale, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.audioContext.destination);
    oscillator.connect(toneGain);
    toneGain.connect(this.audioContext.destination);

    noise.start(now);
    noise.stop(now + 0.25);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    endFrequency = frequency * 0.75
  ): void {
    if (!this.audioContext) {
      return;
    }
    const mixGainScale = this.getMixGainScale();
    if (mixGainScale === 0) {
      return;
    }
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(gainValue * mixGainScale, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playShot(profile: ResolvedShotProfile): void {
    if (!this.audioContext) {
      return;
    }
    const mixGainScale = this.getMixGainScale();
    if (mixGainScale === 0) {
      return;
    }
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const subOscillator = this.audioContext.createOscillator();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();

    oscillator.type = profile.primaryType;
    subOscillator.type = profile.secondaryType;
    oscillator.detune.value = profile.detuneCents;
    subOscillator.detune.value = profile.detuneCents * 0.5;
    oscillator.frequency.setValueAtTime(profile.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, now + profile.duration);
    subOscillator.frequency.setValueAtTime(profile.secondaryStartFrequency, now);
    subOscillator.frequency.exponentialRampToValueAtTime(profile.secondaryEndFrequency, now + profile.duration);
    filter.type = profile.filterType;
    filter.frequency.setValueAtTime(profile.filterFrequency, now);
    filter.Q.value = profile.filterQ;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.gain * mixGainScale, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);

    oscillator.connect(filter);
    subOscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);

    oscillator.start(now);
    subOscillator.start(now);
    oscillator.stop(now + profile.duration + 0.01);
    subOscillator.stop(now + profile.duration + 0.01);
  }

  private getMixGainScale(): number {
    switch (this.audioMix) {
      case "reduced":
        return 0.45;
      case "mute":
        return 0;
      default:
        return 1;
    }
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * 0.5;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
