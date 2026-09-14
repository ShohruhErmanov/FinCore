import { cn } from '@/shared/lib/cn';

/**
 * The single in-app source for the FinCore mark. The wordmark stays as live
 * text for accessibility and sharp rendering; this image is decorative when
 * it appears beside that text.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/fincore-mark-v3-64.png"
      srcSet="/brand/fincore-mark-v3-64.png 1x, /brand/fincore-mark-v3-128.png 2x"
      width="64"
      height="64"
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      className={cn('block select-none object-contain', className)}
    />
  );
}
