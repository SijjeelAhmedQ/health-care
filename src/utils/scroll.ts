/**
 * The application never scrolls the browser page: the shell is one viewport
 * tall and content scrolls inside it. These helpers find the element that is
 * actually scrolling, so "scroll down", pagination and "start at the top"
 * keep working whichever layout the current page uses.
 */

/** Regions inside workspace pages that scroll on their own (list, open item, table body, tab panel). */
const REGION_SELECTOR = '[data-scroll-region], .page-fill .data-table-card .ant-table-content, .page-fill .summary-tabs > .ant-tabs-content-holder';

const scrolls = (el: Element) => el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible' && getComputedStyle(el).overflowY !== 'hidden';
const visible = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';

/** The main content area — the scroll container for ordinary pages. */
export function mainContent(): HTMLElement | null {
  return document.getElementById('main-content');
}

/**
 * The element the user would expect to move: the most specific visible region
 * that can scroll (the last one in the document — the open item beats the list),
 * then the main content area, then the document itself.
 */
export function primaryScroller(): HTMLElement {
  const regions = Array.from(document.querySelectorAll<HTMLElement>(REGION_SELECTOR)).filter((el) => visible(el) && scrolls(el));
  if (regions.length) return regions[regions.length - 1];
  const main = mainContent();
  if (main && scrolls(main)) return main;
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/** Bring the main content area back to its top (e.g. after changing page on a phone). */
export function scrollMainToTop(behavior: ScrollBehavior = 'auto') {
  mainContent()?.scrollTo?.({ top: 0, behavior });
  (document.scrollingElement ?? document.documentElement).scrollTop = 0;
}
