export interface BudgetParts {
  used: number;
  remaining: number;
  exceeded: boolean;
  promptPercent: number;
  completionPercent: number;
}

export function budgetParts(prompt: number, completion: number, maximum: number): BudgetParts {
  const max = Number.isFinite(maximum) && maximum > 0 ? maximum : 0;
  const p = Number.isFinite(prompt) ? Math.max(0, prompt) : 0;
  const c = Number.isFinite(completion) ? Math.max(0, completion) : 0;
  return {
    used: p + c,
    remaining: Math.max(0, max - p - c),
    exceeded: p + c > max,
    promptPercent: max ? Math.min(100, (p / max) * 100) : 0,
    completionPercent: max ? Math.min(Math.max(0, 100 - (p / max) * 100), (c / max) * 100) : 0
  };
}
