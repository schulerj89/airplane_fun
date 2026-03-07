export class SoundController {
  private audioContext: AudioContext | null = null;

  async unlock(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  playLaser(): void {
    this.playTone(440, 0.06, "square", 0.03);
  }

  playHit(): void {
    this.playTone(180, 0.08, "sawtooth", 0.04);
  }

  playExplosion(): void {
    this.playTone(90, 0.18, "triangle", 0.05);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number): void {
    if (!this.audioContext) {
      return;
    }
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }
}
