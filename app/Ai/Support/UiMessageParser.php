<?php

namespace App\Ai\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Laravel\Ai\Files\Base64Document;
use Laravel\Ai\Files\Base64Image;
use Laravel\Ai\Files\Document;
use Laravel\Ai\Files\Image;

/**
 * Parses a single @ai-sdk/react useChat UIMessage into the pieces the agent
 * needs: its plain text and any file attachments (sent as data-URL parts).
 */
class UiMessageParser
{
    /**
     * Extract the plain text from a useChat message (`parts` or `content`).
     */
    public static function text(?array $message): string
    {
        if (! is_array($message)) {
            return '';
        }

        if (isset($message['parts']) && is_array($message['parts'])) {
            return Collection::make($message['parts'])
                ->filter(fn ($part): bool => is_array($part) && ($part['type'] ?? null) === 'text')
                ->map(fn (array $part): string => (string) ($part['text'] ?? ''))
                ->implode("\n");
        }

        return is_string($message['content'] ?? null) ? $message['content'] : '';
    }

    /**
     * Extract attachments from a message's `file` parts (data URLs).
     *
     * Images become Base64Image and everything else Base64Document, matching
     * what the OpenRouter gateway maps into multimodal message content.
     *
     * @return array<int, Base64Image|Base64Document>
     */
    public static function attachments(?array $message): array
    {
        if (! is_array($message) || ! is_array($message['parts'] ?? null)) {
            return [];
        }

        return Collection::make($message['parts'])
            ->filter(fn ($part): bool => is_array($part) && ($part['type'] ?? null) === 'file')
            ->map(function (array $part): Base64Image|Base64Document|null {
                $url = (string) ($part['url'] ?? '');

                if (! Str::startsWith($url, 'data:') || ! Str::contains($url, ';base64,')) {
                    return null;
                }

                [$header, $base64] = explode(';base64,', $url, 2);
                $mediaType = (string) ($part['mediaType'] ?? Str::after($header, 'data:'));

                return Str::startsWith($mediaType, 'image/')
                    ? Image::fromBase64($base64, $mediaType)
                    : Document::fromBase64($base64, $mediaType);
            })
            ->filter()
            ->values()
            ->all();
    }
}
