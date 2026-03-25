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
  const gainNode = context.createGain();
  gainNode.connect(context.destination);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(0.045, startAt + 0.012);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
  gainNode.gain.setValueAtTime(0.0001, startAt + 0.2);
  gainNode.gain.exponentialRampToValueAtTime(0.04, startAt + 0.215);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.36);

  const oscillatorA = context.createOscillator();
  oscillatorA.type = "triangle";
  oscillatorA.frequency.setValueAtTime(740, startAt);
  oscillatorA.frequency.exponentialRampToValueAtTime(880, startAt + 0.16);
  oscillatorA.connect(gainNode);
  oscillatorA.start(startAt);
  oscillatorA.stop(startAt + 0.18);

  const oscillatorB = context.createOscillator();
  oscillatorB.type = "triangle";
  oscillatorB.frequency.setValueAtTime(988, startAt + 0.2);
  oscillatorB.frequency.exponentialRampToValueAtTime(1174, startAt + 0.34);
  oscillatorB.connect(gainNode);
  oscillatorB.start(startAt + 0.2);
  oscillatorB.stop(startAt + 0.36);

  oscillatorB.onended = () => {
    gainNode.disconnect();
  };

  return true;
};
