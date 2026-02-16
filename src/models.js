/**
 * Heliox - Model Configuration
 * AI model definitions and selection
 */
export const MODELS = {
    'gemini-3': {
        id: 'gemini-3',
        name: 'Gemini 3',
        status: 'active',
        supportsGrounding: true,
        description: 'Advanced reasoning with grounded search'
    },
    'gpt-5.2': {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        status: 'coming-soon',
        supportsGrounding: false,
        description: 'Grounded search will be available when this model launches.'
    }
};

export const DEFAULT_MODEL = 'gemini-3';

export function getModel(modelId) {
    return MODELS[modelId] || MODELS[DEFAULT_MODEL];
}

export function getActiveModels() {
    return Object.values(MODELS).filter(m => m.status === 'active');
}

export function getAllModels() {
    return Object.values(MODELS);
}

export function isModelAvailable(modelId) {
    const model = MODELS[modelId];
    return model && model.status === 'active';
}

export function getModelGroundingMessage(modelId) {
    const model = MODELS[modelId];
    if (!model) return '';
    if (!model.supportsGrounding) {
        return model.description;
    }
    return '';
}
