/** @typedef {'openai' | 'azure' | 'openai_compatible' | 'web_request' | 'azure_document_intelligence'} ProviderType */

/** @typedef {{ value: ProviderType, label: string, description: string, defaultBaseUrl: string, icon: string, modelProbePath?: string }} ProviderOption */

/** @type {readonly ProviderOption[]} */
const PROVIDERS = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'Official OpenAI API with your API key.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: 'plug',
    modelProbePath: '/models'
  },
  {
    value: 'azure',
    label: 'Azure',
    description: 'Azure OpenAI Service deployment endpoint.',
    defaultBaseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT',
    icon: 'settings'
  },
  {
    value: 'openai_compatible',
    label: 'OpenAI Compatible',
    description: 'Any service that speaks the OpenAI chat/completions API.',
    defaultBaseUrl: 'https://api.example.com/v1',
    icon: 'link',
    modelProbePath: '/models'
  },
  {
    value: 'web_request',
    label: 'Web Request',
    description: 'Arbitrary HTTP endpoint for a custom gateway.',
    defaultBaseUrl: 'https://api.example.com/extract',
    icon: 'link'
  },
  {
    value: 'azure_document_intelligence',
    label: 'Azure Document Intelligence',
    description: 'Azure Document Intelligence OCR for PDF, JPEG, PNG, and DOCX.',
    defaultBaseUrl: 'https://YOUR-RESOURCE.cognitiveservices.azure.com',
    icon: 'file'
  }
];

export const AZURE_OCR_PROVIDER_TYPE = 'azure_document_intelligence';

export const DEFAULT_AZURE_OCR_API_VERSION = '2024-11-30';

/** The provider a new or unreadable Connector gets; `providerByType` falls back to the same one. */
export const DEFAULT_PROVIDER_TYPE = PROVIDERS[0].value;

/** @param {ProviderType} type */
export function providerByType(type) {
  return PROVIDERS.find(p => p.value === type) ?? PROVIDERS[0];
}

/** @param {ProviderType} type */
export function defaultBaseUrlFor(type) {
  return providerByType(type).defaultBaseUrl;
}

/** @param {ProviderType} type */
export function defaultNameFor(type) {
  return providerByType(type).label;
}

/** @type {readonly { value: ProviderType, label: string }[]} */
export const PROVIDER_SELECT_ITEMS = PROVIDERS.map(p => ({ value: p.value, label: p.label }));
