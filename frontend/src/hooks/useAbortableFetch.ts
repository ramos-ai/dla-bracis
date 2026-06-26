import { useRef, useCallback, useEffect } from 'react';
import axios, { CancelTokenSource } from 'axios';

/**
 * Hook that provides abort controller functionality for async operations.
 * Automatically cancels pending requests on unmount or when dependencies change.
 * 
 * @returns Object with createAbortSignal and cancelAll functions
 */
export function useAbortController() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const createAbortSignal = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);

  const cancelAll = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelAll();
    };
  }, [cancelAll]);

  return { createAbortSignal, cancelAll };
}

/**
 * Hook that provides axios cancel token functionality for async operations.
 * Use this for axios requests since axios uses CancelToken instead of AbortController.
 * Automatically cancels pending requests on unmount.
 * 
 * @returns Object with createCancelToken, cancelAll, and isCancel functions
 */
export function useAxiosCancelToken() {
  const cancelTokensRef = useRef<CancelTokenSource[]>([]);

  const createCancelToken = useCallback(() => {
    const source = axios.CancelToken.source();
    cancelTokensRef.current.push(source);
    return source.token;
  }, []);

  const cancelAll = useCallback((message = 'Operation cancelled') => {
    cancelTokensRef.current.forEach(source => {
      source.cancel(message);
    });
    cancelTokensRef.current = [];
  }, []);

  const isCancel = useCallback((error: unknown): boolean => {
    return axios.isCancel(error);
  }, []);

  useEffect(() => {
    return () => {
      cancelAll('Component unmounted');
    };
  }, [cancelAll]);

  return { createCancelToken, cancelAll, isCancel };
}

/**
 * Hook that provides a simple cancelled flag pattern for async operations.
 * Useful when you can't use AbortController (e.g., third-party APIs).
 * 
 * @returns Object with isCancelled ref and reset function
 */
export function useCancelledFlag() {
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const isCancelled = useCallback(() => {
    return cancelledRef.current;
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return { isCancelled, reset, cancel };
}
