<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { useId } from 'bits-ui';

  type InputOwnProps = {
    id?: string;
    value?: string;
    label: string;
    description?: string;
    message?: string;
    error?: string;
    inlineMessage?: boolean;
    validate?: (value: string) => string | undefined;
    onblur?: (event: FocusEvent) => void;
    oninput?: (event: Event) => void;
    type?: HTMLInputElement['type'];
    disabled?: boolean;
    required?: boolean;
    affix?: boolean;
    prefix?: Snippet;
    suffix?: Snippet;
  };

  type Props = Omit<
    HTMLInputAttributes,
    keyof InputOwnProps | 'value' | 'id' | 'type' | 'disabled' | 'required'
  > &
    InputOwnProps;

  let {
    id = useId(),
    value = $bindable(''),
    label,
    description = '',
    message = '',
    error = '',
    inlineMessage = false,
    validate = undefined,
    onblur = undefined,
    oninput = undefined,
    type = 'text',
    disabled = false,
    required = false,
    affix = false,
    prefix = undefined,
    suffix = undefined,
    ...rest
  }: Props = $props();
  let localError = $state('');
  const shownError = $derived(error || localError);
  /* The framed input is styled by `.price-input input`, so it carries no class of its own. */
  const controlAttrs = $derived(affix ? rest : { ...rest, class: 'input' });
  function blurred(event: FocusEvent) {
    if (validate) localError = validate(value) || '';
    onblur?.(event);
  }
  function edited(event: Event) {
    if (validate && localError) localError = validate(value) || '';
    oninput?.(event);
  }
</script>
<div class="field" data-invalid={shownError || undefined}>
  <div class="field-content">
    <div class="label-row" class:label-row--with-msg={inlineMessage && (shownError || message)}>
      <label class="label" for={id}>{label}{required ? ' *' : ''}</label>
      {#if inlineMessage && (shownError || message)}
        <span
          class={shownError ? 'field-msg error' : 'field-msg ok'}
          id={id + '-message'}
          role={shownError ? 'alert' : undefined}
        >{shownError || message}</span>
      {/if}
    </div>
    {#if description}<p class="field-desc" id={id + '-description'}>{description}</p>{/if}
  </div>
  {#snippet control()}<input {...controlAttrs} {id} {type} bind:value {disabled} {required}
    aria-invalid={shownError ? 'true' : undefined}
    aria-describedby={
      [description ? id + '-description' : '', shownError || message ? id + '-message' : '']
        .filter(Boolean)
        .join(' ') || undefined
    }
    onblur={blurred}
    oninput={edited}
  />{/snippet}
  {#if affix}
    <div class="price-input">{@render prefix?.()}{@render control()}{@render suffix?.()}</div>
  {:else}
    {@render control()}
  {/if}
  {#if !inlineMessage && (shownError || message)}
    <p
      class={shownError ? 'field-msg error' : 'field-msg ok'}
      id={id + '-message'}
      role={shownError ? 'alert' : undefined}
    >{shownError || message}</p>
  {/if}
</div>
