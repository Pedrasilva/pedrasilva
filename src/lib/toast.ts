import { toast as originalToast } from 'sonner';
import { translateErrorMessage } from './translate-error';

type ErrorArgs = Parameters<typeof originalToast.error>;
/** Keep Sonner's IDs, actions, duration and all non-error APIs unchanged. */
export const toast = Object.assign(
  (...args: Parameters<typeof originalToast>) => originalToast(...args),
  originalToast,
  {
    error: (message: ErrorArgs[0], options?: ErrorArgs[1]) => {
      const translated = typeof message === 'string' ? translateErrorMessage(message) : message;
      const description = options?.description;
      return originalToast.error(translated, typeof description === 'string'
        ? { ...options, description: translateErrorMessage(description) }
        : options);
    },
  },
);
