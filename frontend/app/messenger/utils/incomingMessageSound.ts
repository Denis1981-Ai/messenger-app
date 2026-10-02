type BrowserAudioContext = AudioContext;

let audioContextPromise: Promise<BrowserAudioContext | null> | null = null;
let interactionPrimed = false;

const getAudioContextCtor = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
};

const getAudioContext = async () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContextPromise) {
    audioContextPromise = Promise.resolve().then(() => {
      const AudioContextCtor = getAudioContextCtor();
      if (!AudioContextCtor) {
        return null;
      }

      try {
        return new AudioContextCtor();
      } catch {
        return null;
      }
    });
  }

  return audioContextPromise;
};

const resumeAudioContext = async () => {
  const context = await getAudioContext();
  if (!context) {
    return null;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return context;
    }
  }

  return context;
};

const primeOnInteraction = () => {
  if (interactionPrimed || typeof window === "undefined") {
    return;
  }

  interactionPrimed = true;

  const handleInteraction = () => {
    void resumeAudioContext();
  };

  window.addEventListener("pointerdown", handleInteraction, { passive: true });
  window.addEventListener("keydown", handleInteraction, { passive: true });
};

export const prepareIncomingMessageSound = () => {
  primeOnInteraction();
};

export const playIncomingMessageSound = async () => {
  const context = await resumeAudioContext();
  if (!context || context.state !== "running") {
    return false;
  }

  const startAt = context.currentTime + 0.01;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-20, startAt);
  compressor.knee.setValueAtTime(18, startAt);
  compressor.ratio.setValueAtTime(6, startAt);
  compressor.attack.setValueAtTime(0.003, startAt);
  compressor.release.setValueAtTime(0.18, startAt);
  compressor.connect(context.destination);

  const gainNode = context.createGain();
  gainNode.connect(compressor);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.11, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
  gainNode.gain.setValueAtTime(0.0001, startAt + 0.18);
  gainNode.gain.exponentialRampToValueAtTime(0.085, startAt + 0.195);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
  gainNode.gain.setValueAtTime(0.0001, startAt + 0.36);
  gainNode.gain.exponentialRampToValueAtTime(0.12, startAt + 0.375);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.56);

  const oscillatorA = context.createOscillator();
  oscillatorA.type = "square";
  oscillatorA.frequency.setValueAtTime(920, startAt);
  oscillatorA.frequency.exponentialRampToValueAtTime(1140, startAt + 0.14);
  oscillatorA.connect(gainNode);
  oscillatorA.start(startAt);
  oscillatorA.stop(startAt + 0.16);

  const oscillatorB = context.createOscillator();
  oscillatorB.type = "square";
  oscillatorB.frequency.setValueAtTime(1180, startAt + 0.18);
  oscillatorB.frequency.exponentialRampToValueAtTime(1320, startAt + 0.32);
  oscillatorB.connect(gainNode);
  oscillatorB.start(startAt + 0.18);
  oscillatorB.stop(startAt + 0.34);

  const oscillatorC = context.createOscillator();
  oscillatorC.type = "triangle";
  oscillatorC.frequency.setValueAtTime(880, startAt + 0.36);
  oscillatorC.frequency.exponentialRampToValueAtTime(1280, startAt + 0.54);
  oscillatorC.connect(gainNode);
  oscillatorC.start(startAt + 0.36);
  oscillatorC.stop(startAt + 0.56);

  oscillatorC.onended = () => {
    gainNode.disconnect();
    compressor.disconnect();
  };

  return true;
};
