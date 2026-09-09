export const QUESTION_TEXT = "What do you know is true but you can't prove?";
export const QUESTION_SLUG = 'what-do-you-know-is-true';
export const QUESTION_ID_MOCK = 'what-do-you-know-is-true';

export const MIN_ANSWER_LENGTH = 20;
export const MAX_ANSWER_LENGTH = 500;
export const MIN_UNIQUE_LENGTH = 3;
export const MAX_UNIQUE_LENGTH = 120;
export const MIN_REASON_LENGTH = 4;
export const MAX_REASON_LENGTH = 100;

export const SITE_URL = 'thebetween.world';

/**
 * sessionStorage key carrying the shortcode of a star that was *just* born.
 * Submitting navigates to the cosmos, so the birth moment has to survive one
 * document boundary: UniqueOverlay sets it, the cosmos page consumes it once
 * (Phase 7 plays the bloom; Phase 8 will hang the visual bloom off the same
 * flag).
 */
export const BIRTH_FLAG_KEY = 'btw_star_born';
