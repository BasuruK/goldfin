<script>
  let { name = 'chevron', size = 16 } = $props();
  const paths = {
    check: 'm5 12 4 4L19 6', minus: 'M5 12h14', chevron: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12M18 6 6 18', trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    link: 'm7 7 10 10-5 5V2l5 5L7 17', play: 'm8 5 11 7-11 7Z',
    copy: 'M9 9h11v11H9zM15 9V4H4v11h5', file: 'M14 2H5v20h14V7ZM14 2v6h5',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', arrow: 'M4 12h16m-6-6 6 6-6 6',
    error: 'M12 7v6m0 4v.1', info: 'M12 10v7m0-10v.1',
    branch: 'M4 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 7v10M8 5h3a7 7 0 0 1 7 5'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'error' || name === 'info'}<circle cx="12" cy="12" r="9" />{/if}
  <path d={paths[name] || paths.chevron} />
</svg>