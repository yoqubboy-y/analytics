import type { ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export default function AppLogoIcon({
    className,
    ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
    return (
        <img
            src="/logo.svg"
            alt="Rooler"
            className={cn('object-contain', className)}
            {...props}
        />
    );
}
