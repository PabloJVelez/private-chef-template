import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useMatches, useNavigation } from 'react-router';
import { parseMealPrep, type MealPrepDiscovery, type MealPrepRead } from '@libs/meal-prep';

const failure: MealPrepRead = { ok: false };
const MealPrepContext = createContext({
  result: failure as MealPrepRead,
  navigation: null as MealPrepDiscovery | null,
  refreshing: false,
  refresh: () => {},
});
export const useMealPrep = () => useContext(MealPrepContext);

export function MealPrepProvider({ children }: PropsWithChildren) {
  const matches = useMatches();
  const transition = useNavigation();
  // Prefer the landing loader on SSR and navigation: page and header use one projection.
  const rootRead = (matches[0]?.data as { mealPrep?: MealPrepRead } | undefined)?.mealPrep ?? failure;
  const landingRead = matches.find((match) => match.id === 'routes/meal-prep')?.data as
    | { mealPrep: MealPrepRead }
    | undefined;
  const routeRead = landingRead?.mealPrep ?? rootRead;
  const [inputs, setInputs] = useState({ rootRead, landingRead });
  const [result, setResult] = useState(routeRead);
  const [navigation, setNavigation] = useState<MealPrepDiscovery | null>(routeRead.ok ? routeRead.discovery : null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const pending = useRef<AbortController>();
  // Reconcile before children render, including navigation responses arriving after focus reads.
  if (inputs.rootRead !== rootRead || inputs.landingRead !== landingRead) {
    setInputs({ rootRead, landingRead });
    const next = landingRead?.mealPrep ?? (inputs.rootRead !== rootRead ? rootRead : null);
    if (next) {
      generation.current += 1;
      pending.current?.abort();
      setResult(next);
      setRefreshing(false);
      if (next.ok) setNavigation(next.discovery);
    }
  }
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    setRefreshing(true);
    let next: MealPrepRead = failure;
    try {
      const response = await fetch('/api/meal-prep', { cache: 'no-store', signal: controller.signal });
      if (response.ok) next = { ok: true, discovery: parseMealPrep(await response.json()) };
    } catch {
      /* Keep failures local; only navigation may retain the last successful read. */
    } finally {
      clearTimeout(timeout);
    }
    if (id !== generation.current) return;
    setResult(next);
    if (next.ok) setNavigation(next.discovery);
    setRefreshing(false);
  }, []);
  useEffect(() => {
    if (transition.state !== 'idle') {
      ++generation.current;
      pending.current?.abort();
      setRefreshing(false);
    }
  }, [transition.state]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState !== 'hidden' && transition.state === 'idle') void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh, transition.state]);
  useEffect(
    () => () => {
      ++generation.current;
      pending.current?.abort();
    },
    [],
  );
  return (
    <MealPrepContext.Provider value={{ result, navigation, refreshing, refresh }}>{children}</MealPrepContext.Provider>
  );
}
