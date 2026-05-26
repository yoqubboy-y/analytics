<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\AnalyticsAssistant;
use App\Ai\OpenRouterModels;
use App\Ai\Support\UiMessageParser;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Responses\StreamableAgentResponse;

class ChatController extends Controller
{
    public function __construct(private readonly OpenRouterModels $models) {}

    /**
     * Stream an assistant reply for the user's current team.
     *
     * Consumes the @ai-sdk/react useChat payload and streams back using the
     * Vercel data protocol, via the user's chosen OpenRouter model.
     */
    public function __invoke(Request $request): StreamableAgentResponse
    {
        $user = $request->user();
        $team = $user?->currentTeam;

        abort_unless($team, 403, 'No active team.');

        // When the catalogue is available, constrain the model to it; otherwise
        // (e.g. OpenRouter unreachable) accept any string and fall back below.
        $allowed = $this->models->ids();
        $modelRules = $allowed->isNotEmpty()
            ? ['nullable', 'string', Rule::in($allowed->all())]
            : ['nullable', 'string', 'max:128'];

        $validated = $request->validate([
            'messages' => ['required', 'array', 'min:1'],
            'model' => $modelRules,
            'fresh' => ['nullable', 'boolean'],
            'conversation' => ['nullable', 'string'],
            'regenerate' => ['nullable', 'boolean'],
        ]);

        // The client (useChat) sends the full transcript, but history is
        // persisted server-side, so we only stream the latest user turn.
        $latestMessage = collect($validated['messages'])->last();

        $text = UiMessageParser::text($latestMessage);
        $attachments = UiMessageParser::attachments($latestMessage);

        abort_if($text === '' && $attachments === [], 422, 'The last message must contain text or an attachment.');

        $model = $validated['model'] ?? config('chat.default_model');

        $assistant = new AnalyticsAssistant($team);

        // Route to the right conversation: "New chat" starts fresh; an explicit
        // (owned) conversation id resumes that thread; otherwise resume the
        // user's most recent one. History is stored/reloaded automatically.
        if ($validated['fresh'] ?? false) {
            $assistant = $assistant->forUser($user);
        } elseif ($this->ownsConversation($user, $validated['conversation'] ?? null)) {
            $assistant = $assistant->continue($validated['conversation'], $user);
        } else {
            $assistant = $assistant->continueLastConversation($user);
        }

        // Regenerate: drop the last user+assistant turn so the fresh stream
        // replaces it in place (rather than appending a duplicate).
        if ($validated['regenerate'] ?? false) {
            $this->dropLastTurn($assistant->currentConversation());
        }

        return $assistant
            ->stream($text, attachments: $attachments, provider: Lab::OpenRouter, model: $model)
            ->usingVercelDataProtocol();
    }

    /**
     * Delete the most recent user + assistant messages of a conversation so a
     * regenerated turn cleanly replaces them.
     */
    private function dropLastTurn(?string $conversationId): void
    {
        if (! $conversationId) {
            return;
        }

        foreach (['assistant', 'user'] as $role) {
            ConversationMessage::query()
                ->where('conversation_id', $conversationId)
                ->where('role', $role)
                ->orderByDesc('id')
                ->first()
                ?->delete();
        }
    }

    /**
     * List the tool-capable OpenRouter models for the picker.
     */
    public function models(Request $request): JsonResponse
    {
        abort_unless($request->user()?->currentTeam, 403, 'No active team.');

        return response()->json([
            'default' => config('chat.default_model'),
            'models' => $this->models->all()->all(),
        ]);
    }

    /**
     * List the user's recent conversations for the history switcher.
     */
    public function conversations(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_unless($user?->currentTeam, 403, 'No active team.');

        $conversations = Conversation::query()
            ->where('user_id', $user->id)
            ->orderByDesc('updated_at')
            ->limit(50)
            ->get(['id', 'title', 'updated_at'])
            ->map(fn (Conversation $conversation): array => [
                'id' => $conversation->id,
                'title' => $conversation->title ?: 'Untitled chat',
                'updated_at' => $conversation->updated_at?->toIso8601String(),
            ]);

        return response()->json(['conversations' => $conversations]);
    }

    /**
     * Return a conversation (a specific one, or the latest) as useChat UIMessages.
     */
    public function conversation(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_unless($user?->currentTeam, 403, 'No active team.');

        $query = Conversation::query()->where('user_id', $user->id);

        $requested = $request->query('conversation');

        $conversation = is_string($requested) && $requested !== ''
            ? $query->whereKey($requested)->first()
            : $query->orderByDesc('updated_at')->first();

        if (! $conversation) {
            return response()->json(['conversation' => null, 'title' => null, 'messages' => []]);
        }

        $messages = $conversation->messages()
            ->orderBy('id')
            ->get()
            ->flatMap(fn ($record): array => $this->recordToUiMessages($record))
            ->values()
            ->all();

        return response()->json([
            'conversation' => $conversation->id,
            'title' => $conversation->title ?: 'Untitled chat',
            'messages' => $messages,
        ]);
    }

    /**
     * Rename one of the user's conversations.
     */
    public function rename(Request $request, string $conversation): JsonResponse
    {
        $model = $this->findOwnedConversation($request, $conversation);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:120'],
        ]);

        $model->update(['title' => $validated['title']]);

        return response()->json(['id' => $model->id, 'title' => $model->title]);
    }

    /**
     * Delete one of the user's conversations and its messages.
     */
    public function destroy(Request $request, string $conversation): JsonResponse
    {
        $model = $this->findOwnedConversation($request, $conversation);

        $model->messages()->delete();
        $model->delete();

        return response()->json(['deleted' => $conversation]);
    }

    /**
     * Resolve a conversation owned by the current user, or 404.
     */
    private function findOwnedConversation(Request $request, string $conversationId): Conversation
    {
        $user = $request->user();

        abort_unless($user?->currentTeam, 403, 'No active team.');

        return Conversation::query()
            ->whereKey($conversationId)
            ->where('user_id', $user->id)
            ->firstOrFail();
    }

    /**
     * Map a stored conversation message into one or more useChat UIMessages.
     *
     * @return array<int, array<string, mixed>>
     */
    private function recordToUiMessages(object $record): array
    {
        if ($record->role === 'user') {
            return $record->content === null || $record->content === ''
                ? []
                : [[
                    'id' => $record->id,
                    'role' => 'user',
                    'parts' => [['type' => 'text', 'text' => $record->content]],
                ]];
        }

        if ($record->role !== 'assistant') {
            return [];
        }

        $parts = [];

        // Reconstruct tool invocations so the Tool component renders history.
        $results = collect($record->tool_results ?? [])->keyBy('id');

        foreach ($record->tool_calls ?? [] as $call) {
            $result = $results->get($call['id'] ?? null);

            $parts[] = [
                'type' => 'tool-'.($call['name'] ?? 'tool'),
                'toolCallId' => $call['id'] ?? (string) Str::uuid(),
                'state' => 'output-available',
                'input' => $call['arguments'] ?? null,
                'output' => $result['result'] ?? null,
            ];
        }

        if (is_string($record->content) && $record->content !== '') {
            $parts[] = ['type' => 'text', 'text' => $record->content];
        }

        return $parts === []
            ? []
            : [['id' => $record->id, 'role' => 'assistant', 'parts' => $parts]];
    }

    /**
     * Determine whether the user owns the given conversation.
     */
    private function ownsConversation(object $user, ?string $conversationId): bool
    {
        return is_string($conversationId)
            && $conversationId !== ''
            && Conversation::query()
                ->whereKey($conversationId)
                ->where('user_id', $user->id)
                ->exists();
    }
}
