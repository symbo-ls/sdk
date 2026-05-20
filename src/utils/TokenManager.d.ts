/**
 * TokenManager - Handles access and refresh token management
 * Provides persistence, automatic refresh, and token lifecycle management
 */
export class TokenManager {
    constructor(options?: {});
    config: {
        storagePrefix: string;
        storageType: string;
        refreshBuffer: number;
        maxRetries: number;
        apiUrl: any;
        onTokenRefresh: any;
        onTokenExpired: any;
        onTokenError: any;
    };
    tokens: {
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        expiresIn: any;
    };
    refreshPromise: Promise<{
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        expiresIn: any;
    }>;
    refreshTimeout: number;
    retryCount: number;
    /**
     * Storage keys
     */
    get storageKeys(): {
        accessToken: string;
        refreshToken: string;
        expiresAt: string;
        expiresIn: string;
    };
    /**
     * Get storage instance based on configuration
     */
    get storage(): any;
    /**
     * Memory storage fallback for server-side rendering
     */
    _memoryStorage: {
        _data: {};
        getItem: (key: any) => any;
        setItem: (key: any, value: any) => void;
        removeItem: (key: any) => void;
        clear: () => void;
    };
    /**
     * Set tokens and persist to storage
     */
    setTokens(tokenData: any): {
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        expiresIn: any;
    };
    /**
     * Get current access token
     */
    getAccessToken(): any;
    /**
     * Get current refresh token
     */
    getRefreshToken(): any;
    /**
     * Get authorization header value
     */
    getAuthHeader(): string;
    /**
     * Decode `exp` (seconds since epoch) from a JWT access token without
     * verifying the signature. Returns null when the token is not a JWT or
     * the payload can't be parsed. Used as a fallback when `expiresAt` was
     * never persisted alongside the token — e.g. an external auth flow
     * dropped `symbols_access_token` into localStorage directly, or a stale
     * session lingers from a previous build.
     */
    _decodeJwtExpMs(): number;
    /**
     * Resolve the effective access-token expiry in ms. Prefers the stored
     * `expiresAt` (set via setTokens from `expires_in`); falls back to the
     * JWT `exp` claim when stored expiry is missing. Returns null when no
     * expiry info is available from either source.
     */
    _resolveAccessTokenExpiryMs(): any;
    /**
     * Check if access token is valid and not expired
     */
    isAccessTokenValid(): boolean;
    /**
     * Check if access token exists and is not expired (without refresh buffer)
     */
    isAccessTokenActuallyValid(): boolean;
    /**
     * Check if tokens exist (regardless of expiry)
     */
    hasTokens(): boolean;
    /**
     * Check if refresh token exists
     */
    hasRefreshToken(): boolean;
    /**
     * Automatically refresh tokens if needed
     */
    ensureValidToken(): Promise<any>;
    /**
     * Refresh access token using refresh token
     */
    refreshTokens(): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        expiresIn: any;
    }>;
    /**
     * Perform the actual token refresh request
     */
    _performRefresh(): Promise<{
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        expiresIn: any;
    }>;
    /**
     * Schedule automatic token refresh
     */
    scheduleRefresh(): void;
    /**
     * Save tokens to storage
     */
    saveTokens(): void;
    /**
     * Load tokens from storage
     */
    loadTokens(): void;
    /**
     * Clear all tokens
     */
    clearTokens(): void;
    /**
     * Get token status information.
     *
     * The `status` field is the high-level summary the workspace shell uses
     * to decide between "render data" / "render expired-banner" / "render
     * sign-in form". Three states:
     *  - `'missing'`  — no access token at all
     *  - `'expired'`  — token exists but JWT `exp` is in the past AND no
     *                   refresh token is available to recover
     *  - `'valid'`    — token exists and isAccessTokenValid() agrees
     *                   (covers "refresh-token present, will auto-rotate"
     *                   as well as "long-lived token still in window")
     */
    getTokenStatus(): {
        status: string;
        hasTokens: boolean;
        isValid: boolean;
        hasRefreshToken: boolean;
        expiresAt: any;
        timeToExpiry: number;
        willExpireSoon: boolean;
    };
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export function getTokenManager(options: any): any;
export function createTokenManager(options: any): TokenManager;
