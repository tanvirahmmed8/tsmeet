import Image from 'next/image';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/appConfig';

export function BrandLogo({ className, iconSize = 36, iconOnly = false, wordmarkClassName }: {
  className?: string;
  iconSize?: number;
  iconOnly?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <span role="img" className={cn('inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap font-bold tracking-tight', className)} aria-label={APP_NAME}>
      <Image src="/brand/mark.svg" width={iconSize} height={iconSize} alt="" aria-hidden="true" className="shrink-0" />
      {!iconOnly && <span aria-hidden="true" className={wordmarkClassName}>{APP_NAME}</span>}
    </span>
  );
}
