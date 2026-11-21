import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './supabase';

/**
 * Carrega dados assíncronos e expõe loading/erro/reload.
 * `deps` controla quando recarregar (como no useEffect).
 * `reload(true)` atualiza em silêncio: mantém os dados na tela enquanto busca
 * (usado nas atualizações automáticas, para a lista não "piscar").
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestRef = useRef(0);

  const reload = useCallback(async (silent = false) => {
    const request = ++requestRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await loaderRef.current();
      if (request === requestRef.current) setData(result);
    } catch (err) {
      // numa atualização silenciosa, um erro passageiro não apaga a tela
      if (request === requestRef.current && !silent) setError(errorMessage(err));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload };
}
