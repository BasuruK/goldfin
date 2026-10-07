<script>
  import { useId } from 'bits-ui';
  let { id = useId(), value = $bindable(''), label, description = '', message = '',
    error = '', validate, onblur, oninput, type = 'text', disabled = false, required = false,
    affix = false, prefix, suffix, ...rest } = $props();
  let localError = $state('');
  const shownError = $derived(error || localError);
  /* The framed input is styled by `.price-input input`, so it carries no class of its own. */
  const controlAttrs = $derived(affix ? rest : { ...rest, class: 'input' });
  function blurred(event) {
    if (validate) localError = validate(value) || '';
    onblur?.(event);
  }
  function edited(event) {
    if (validate && localError) localError = validate(value) || '';
    oninput?.(event);
  }
</script>
<div class="field" data-invalid={shownError || undefined}>
  <div class="field-content">
    <label class="label" for={id}>{label}{required ? ' *' : ''}</label>
    {#if description}<p class="field-desc" id={id + '-description'}>{description}</p>{/if}
  </div>
  {#snippet control()}<input {...controlAttrs} {id} {type} bind:value {disabled} {required}
    aria-invalid={shownError ? 'true' : undefined}
    aria-describedby={[description ? id + '-description' : '', shownError || message ? id + '-message' : ''].filter(Boolean).join(' ') || undefined}
    onblur={blurred} oninput={edited} />{/snippet}
  {#if affix}<div class="price-input">{@render prefix?.()}{@render control()}{@render suffix?.()}</div>{:else}{@render control()}{/if}
  {#if shownError || message}<p class={shownError ? 'field-msg error' : 'field-msg ok'} id={id + '-message'} role={shownError ? 'alert' : undefined}>{shownError || message}</p>{/if}
</div>