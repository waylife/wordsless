/**
 * Re-export every repository from one place. UI code should import from
 * `@/db/repositories` rather than reaching into individual files; that
 * keeps the import graph shallow and lets us shuffle internals freely.
 */
export { wordbookRepository } from './wordbooks';
export { wordRepository } from './words';
export { wordStateRepository } from './word-states';
export { reviewLogRepository } from './review-log';
export { aiContentRepository } from './ai-content';
export { favoritesRepository } from './favorites';
export { checkinRepository } from './checkins';
