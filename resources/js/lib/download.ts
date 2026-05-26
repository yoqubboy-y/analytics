import { toPng } from 'html-to-image';

/** Trigger a browser download for an in-memory Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Resolve a usable background colour so captures aren't transparent. */
function resolveBackground(node: HTMLElement): string {
    const bg = getComputedStyle(node).backgroundColor;

    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        return bg;
    }

    return getComputedStyle(document.body).backgroundColor || '#ffffff';
}

/** Capture a DOM node as a PNG and trigger a browser download. */
export async function downloadElementAsPng(
    node: HTMLElement,
    filename: string,
): Promise<void> {
    const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: resolveBackground(node),
    });

    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `${filename}-${stamp}.png`;
    link.href = dataUrl;
    link.click();
}
