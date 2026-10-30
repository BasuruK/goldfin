<script lang="ts">
  import type { Snippet } from 'svelte';

  // `cancel` comes first so focus lands on Cancel; `children` carries the action buttons.
  let { cancel, children }: { cancel?: Snippet; children?: Snippet } = $props();
</script>
<div class="modal-foot">
  <div class="modal-foot-actions">
    {@render cancel?.()}
    {@render children?.()}
  </div>
</div>