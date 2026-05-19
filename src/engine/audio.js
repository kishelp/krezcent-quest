import * as Tone from 'tone';

export const AudioMgr = {
  started: false,
  synths: {},
  async start() {
    if (this.started) return;
    try {
      await Tone.start();
      this.synths.attack = new Tone.PluckSynth({ volume: -12 }).toDestination();
      this.synths.hit = new Tone.MetalSynth({ frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.1 }, volume: -20 }).toDestination();
      this.synths.magic = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.1 }, volume: -10 }).toDestination();
      this.synths.bonk = new Tone.MembraneSynth({ volume: -15 }).toDestination();
      this.synths.chest = new Tone.Synth({ oscillator: { type: 'triangle' }, volume: -12 }).toDestination();
      this.synths.levelup = new Tone.PolySynth(Tone.Synth, { volume: -10 }).toDestination();
      this.started = true;
    } catch (e) { }
  },
  play(key) {
    if (!this.started) return;
    try {
      const n = Tone.now();
      if (key === 'attack') this.synths.attack.triggerAttackRelease('C5', '8n', n);
      else if (key === 'hit') this.synths.hit.triggerAttackRelease('16n', n);
      else if (key === 'magic') this.synths.magic.triggerAttackRelease('A5', '8n', n);
      else if (key === 'bonk') this.synths.bonk.triggerAttackRelease('C2', '16n', n);
      else if (key === 'chest') {
        this.synths.chest.triggerAttackRelease('E5', '8n', n);
        this.synths.chest.triggerAttackRelease('G5', '8n', n + 0.1);
        this.synths.chest.triggerAttackRelease('C6', '4n', n + 0.2);
      }
      else if (key === 'levelup') this.synths.levelup.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '4n', n);
    } catch (e) { }
  }
};