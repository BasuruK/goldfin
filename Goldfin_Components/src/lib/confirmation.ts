export type ConfirmationResult = 'confirmed' | 'canceled';

export function createConfirmation(onResult: (result: ConfirmationResult) => void = () => {}) {
  let active = false;
  let confirmed = false;
  return {
    begin() {
      active = true;
      confirmed = false;
    },
    confirm() {
      if (active) confirmed = true;
    },
    close() {
      if (!active) return;
      active = false;
      onResult(confirmed ? 'confirmed' : 'canceled');
    }
  };
}

export function validSuiteName(value: string): boolean {
  return value.trim().length >= 3;
}
