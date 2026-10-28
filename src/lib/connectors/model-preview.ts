import type { CatalogResult } from './models.ts';
import type { ProviderType } from './providers.ts';

export async function previewModelCatalog(providerType: ProviderType): Promise<CatalogResult> {
  if (providerType === 'azure' || providerType === 'web_request') {
    return {
      state: 'unsupported',
      message:
        'Simulated discovery is unavailable for this endpoint. Add a model or deployment ID manually; access stays unverified.'
    };
  }
  return {
    ids: ['sample-chat-small', 'sample-chat-large', 'sample-reasoning'],
    source: 'sample',
    message:
      'Simulated catalog. These are example IDs; no provider was contacted and access is not verified.'
  };
}
