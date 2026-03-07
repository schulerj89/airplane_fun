export class SoundController {
  private audioContext: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  async unlock(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.noiseBuffer = this.createNoiseBuffer(this.audioContext);
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  playLaser(): void {
    if (!this.audioContext) {
      return;
    }
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const subOscillator = this.audioContext.createOscillator();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();

    oscillator.type = "square";
    subOscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(980, now);
    oscillator.frequency.exponentialRampToValueAtTime(260, now + 0.12);
    subOscillator.frequency.setValueAtTime(490, now);
    subOscillator.frequency.exponentialRampToValueAtTime(180, now + 0.12);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.connect(filter);
    subOscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);

    oscillator.start(now);
    subOscillator.start(now);
    oscillator.stop(now + 0.13);
    subOscillator.stop(now + 0.13);
  }

  playHit(): void {
    this.playTone(180, 0.1, "triangle", 0.03, 95);
  }

  playExplosion(): void {
    if (!this.audioContext || !this.noiseBuffer) {
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
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(140, now);
    oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.24);
    toneGain.gain.setValueAtTime(0.03, now);
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
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
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
