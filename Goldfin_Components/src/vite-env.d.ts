/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Window {
  harness: {
    setJson: (value: unknown) => void;
    finishOldestRun: () => Promise<void>;
  };
}
