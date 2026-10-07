<script>
  // `cancel` comes first so focus lands on Cancel; `children` carries the action buttons.
  let { cancel, children } = $props();
</script>
<div class="modal-foot">
  {@render cancel?.()}
  {@render children?.()}
</div>