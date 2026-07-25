import { createContext, useContext } from 'react';
import type { Store } from './useStore';

export const StoreContext = createContext<Store | null>(null);

export function useAppStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useAppStore must be used within StoreProvider');
  return ctx;
}
