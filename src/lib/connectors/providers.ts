export type ProviderType =
  | 'openai'
  | 'azure'
  | 'openai_compatible'
  | 'web_request'
  | 'azure_document_intelligence';

export interface ProviderOption {
  value: ProviderType;
  label: string;
  description: string;
  defaultBaseUrl: string;
  icon: string;
  modelProbePath?: string;
}

const PROVIDERS: readonly ProviderOption[] = [
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

export function isSavableProvider(providerType: string): boolean {
  return providerType === 'web_request' || providerType === AZURE_OCR_PROVIDER_TYPE;
}

/** The provider a new or unreadable Connector gets; `providerByType` falls back to the same one. */
export const DEFAULT_PROVIDER_TYPE = PROVIDERS[0].value;

export function providerByType(type: string): ProviderOption {
  return PROVIDERS.find(p => p.value === type) ?? PROVIDERS[0];
}

export function defaultBaseUrlFor(type: ProviderType): string {
  return providerByType(type).defaultBaseUrl;
}

export function defaultNameFor(type: ProviderType): string {
  return providerByType(type).label;
}

export const PROVIDER_SELECT_ITEMS: readonly { value: ProviderType; label: string }[] = PROVIDERS.map(p => ({
  value: p.value,
  label: p.label
}));
