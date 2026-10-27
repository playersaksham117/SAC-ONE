import { router, type Href } from 'expo-router';

/**
 * Back, or to `fallback` when there is nothing to go back to: on SAC-POS web a screen opened
 * from a link or after a page reload has no history ("GO_BACK was not handled").
 */
export function goBack(fallback: Href = '/sell'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
