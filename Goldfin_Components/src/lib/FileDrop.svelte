<script>
  import { useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  import { matchesAccept } from './validation.js';
  let { file = $bindable(null), accept = '.pdf,.json,.txt', label = 'File drop', name = 'No file chosen', description = 'Click to browse or drop a file here' } = $props();
  const id = useId();
  let input;
  let error = $state('');
  function syncInput() { const transfer = new DataTransfer(); if (file) transfer.items.add(file); input.files = transfer.files; }
  /* Local only: FileDrop selects a file, it never uploads one. */
  function choose(candidate) { if (!candidate) return; if (!matchesAccept(candidate, accept)) { error = 'Choose a file matching ' + accept + '.'; syncInput(); return; } file = candidate; error = ''; if (input.files[0] !== candidate) syncInput(); }
  function drop(event) { event.preventDefault(); choose(event.dataTransfer?.files[0]); }
</script><div class="field"><label class="label" for={id}>{label}</label><label class="drop gf-drop" for={id} ondragover={event => event.preventDefault()} ondrop={drop}><Icon name="file" size={20}/><span class="doc"><span class="name">{file?.name || name}</span><span class="sub">{file ? Math.ceil(file.size / 1024) + ' KB · local file selected' : description}</span></span><input bind:this={input} id={id} type="file" {accept} onchange={event => choose(event.currentTarget.files[0])}/></label>{#if error}<p class="field-msg error" role="alert">{error}</p>{/if}</div>