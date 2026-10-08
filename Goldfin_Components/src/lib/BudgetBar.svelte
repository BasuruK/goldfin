<script>
  import { budgetParts } from './budget.js';
  let { prompt = 0, completion = 0, maximum = 4096, label = 'Token budget' } = $props();
  const parts = $derived(budgetParts(prompt, completion, maximum));
  const meterMax = $derived(Number.isFinite(maximum) ? Math.max(1, maximum) : 1);
  const format = value => value.toLocaleString('en-US');
</script><div class="field"><div class="label-row"><span class="label">{label} ({format(maximum)} max)</span><span class="value">{format(parts.used)} / {format(maximum)}</span></div>
<div class="budget-bar" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax={meterMax} aria-valuenow={Math.min(meterMax, parts.used)} aria-valuetext={format(parts.used) + ' of ' + format(maximum) + ' tokens'}><div class="p" style:width={parts.promptPercent + '%'}></div><div class="c" style:width={parts.completionPercent + '%'}></div></div>
<div class="legend"><span class="k"><span class="sw sw-key"></span>Prompt</span><span class="v">{format(prompt)}</span><span class="k"><span class="sw sw-num"></span>Completion</span><span class="v">{format(completion)}</span><span class="k dim"><span class="sw sw-rest"></span>Remaining</span><span class="v">{format(parts.remaining)}</span></div>{#if parts.exceeded}<p class="field-msg error" role="status">Token budget exceeded.</p>{/if}</div>