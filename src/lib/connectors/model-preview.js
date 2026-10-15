/** @typedef {import('./providers.js').ProviderType} ProviderType */
/** @typedef {import('./models.js').CatalogResult} CatalogResult */

/**
 * @param {ProviderType} providerType
 * @returns {Promise<CatalogResult>}
 */
export async function previewModelCatalog(providerType) {
  if (providerType === 'azure' || providerType === 'web_request') {
    return {
      state: 'unsupported',
      message: 'Simulated discovery is unavailable for this endpoint. Add a model or deployment ID manually; access stays unverified.'
    };
  }
  return {
    ids: ['sample-chat-small', 'sample-chat-large', 'sample-reasoning'],
    source: 'sample',
    message: 'Simulated catalog. These are example IDs; no provider was contacted and access is not verified.'
  };
}
