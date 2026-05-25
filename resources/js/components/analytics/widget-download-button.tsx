import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { downloadElementAsPng } from '@/lib/download';

interface WidgetDownloadButtonProps {
    /** The node to capture as a PNG. */
    targetRef: RefObject<HTMLElement | null>;
    /** File name (without extension or date stamp). */
    filename: string;
    label?: string;
}

/** Small icon button that downloads its target widget as a PNG image. */
export function WidgetDownloadButton({
    targetRef,
    filename,
    label = 'Download as image',
}: WidgetDownloadButtonProps) {
    const [busy, setBusy] = useState(false);

    async function handleDownload() {
        if (!targetRef.current || busy) {
            return;
        }

        setBusy(true);

        try {
            await downloadElementAsPng(targetRef.current, filename);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label={label}
            title={label}
            onClick={handleDownload}
            disabled={busy}
        >
            {busy ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <DownloadIcon className="h-3.5 w-3.5" />
            )}
        </Button>
    );
}
