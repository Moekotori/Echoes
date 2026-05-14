import { useCallback, useEffect, useRef } from 'react';

type InfiniteScrollSentinelProps = {
  canLoadMore: boolean;
  isLoading?: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
  fallbackDistance?: number;
};

export const getPageScrollContainer = (element: Element | null): HTMLElement | null =>
  (element?.closest('.page-surface') as HTMLElement | null) ?? null;

export const readPageScrollTop = (element: Element | null): number => getPageScrollContainer(element)?.scrollTop ?? 0;

export const writePageScrollTop = (element: Element | null, top: number): void => {
  const container = getPageScrollContainer(element);

  if (container) {
    container.scrollTop = top;
  }
};

export const InfiniteScrollSentinel = ({
  canLoadMore,
  isLoading = false,
  onLoadMore,
  rootMargin = '900px 0px',
  fallbackDistance = 900,
}: InfiniteScrollSentinelProps): JSX.Element => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    requestedRef.current = false;
  }, [canLoadMore, isLoading, onLoadMore]);

  const requestLoadMore = useCallback((): void => {
    if (!canLoadMore || isLoading || requestedRef.current) {
      return;
    }

    requestedRef.current = true;
    onLoadMore();
  }, [canLoadMore, isLoading, onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !canLoadMore || isLoading) {
      return undefined;
    }

    const root = getPageScrollContainer(sentinel);

    if (typeof window.IntersectionObserver === 'function') {
      const observer = new window.IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            requestLoadMore();
          }
        },
        { root, rootMargin },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    }

    if (!root) {
      return undefined;
    }

    const handleScroll = (): void => {
      const distanceToBottom = root.scrollHeight - root.scrollTop - root.clientHeight;

      if (distanceToBottom <= fallbackDistance) {
        requestLoadMore();
      }
    };

    root.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      root.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [canLoadMore, fallbackDistance, isLoading, requestLoadMore, rootMargin]);

  return <div className="infinite-scroll-sentinel" ref={sentinelRef} aria-hidden="true" />;
};
