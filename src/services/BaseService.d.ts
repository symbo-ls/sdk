export class BaseService {
    constructor({ context, options }?: {});
    _context: any;
    _options: any;
    _ready: boolean;
    _error: any;
    _apiUrl: any;
    _tokenManager: any;
    init({ context }: {
        context: any;
    }): void;
    updateContext(context: any): void;
    getStatus(): {
        ready: boolean;
        error: any;
        context: any;
    };
    isReady(): boolean;
    _setReady(ready?: boolean): void;
    _setError(error: any): void;
    _getTrackingService(): any;
    _shouldTrackErrors(): boolean;
    _trackServiceError(error: any, details?: {}): void;
    _requireAuth(): void;
    _requireReady(methodName?: string): void;
    _request(endpoint: any, options?: {}): Promise<any>;
    _requestExternal(url: any, options?: {}): Promise<any>;
    _call(methodName: any, endpoint: any, { method, body, headers }?: {
        method?: string;
    }): Promise<any>;
    _requiresInit(methodName: any): boolean;
    _createSubdomainRecords(name: any): Promise<any>;
    _sseSubscribe(path: any, filter: {}, onEvent: any): () => void;
    _streamPost(path: any, body: any, { onChunk, onDone, onError }?: {}): () => void;
    destroy(): void;
}
