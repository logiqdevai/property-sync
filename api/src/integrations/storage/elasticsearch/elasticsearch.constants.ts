export const ELASTICSEARCH_CLIENT = 'ELASTICSEARCH_CLIENT';
export const EMBEDDING_DIMS = 1536;

export const VECTOR_FIELD = {
    type: 'dense_vector',
    dims: EMBEDDING_DIMS,
    index: true,
    similarity: 'cosine',
} as const;
