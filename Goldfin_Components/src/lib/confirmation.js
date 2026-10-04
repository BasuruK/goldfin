export function createConfirmation(onResult = () => {}) {
  let active = false;
  let confirmed = false;
  return {
    begin() { active = true; confirmed = false; },
    confirm() { if (active) confirmed = true; },
    close() {
      if (!active) return;
      active = false;
      onResult(confirmed ? 'confirmed' : 'canceled');
    }
  };
}
export function validSuiteName(value) {
  return value.trim().length >= 3;
}
