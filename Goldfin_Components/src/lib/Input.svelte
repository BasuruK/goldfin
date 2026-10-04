<script>
  import { useId } from 'bits-ui';
  let { id = useId(), value = $bindable(''), label, description = '', message = '',
    error = '', validate, onblur, oninput, type = 'text', disabled = false, required = false, ...rest } = $props();
  let localError = $state('');
  const shownError = $derived(error || localError);
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
  <input {...rest} {id} {type} bind:value {disabled} {required} class="input"
    aria-invalid={shownError ? 'true' : undefined}
    aria-describedby={[description ? id + '-description' : '', shownError || message ? id + '-message' : ''].filter(Boolean).join(' ') || undefined}
    onblur={blurred} oninput={edited} />
  {#if shownError || message}<p class={shownError ? 'field-msg error' : 'field-msg ok'} id={id + '-message'} role={shownError ? 'alert' : undefined}>{shownError || message}</p>{/if}
</div>