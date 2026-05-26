<?php

use App\Ai\Agents\AnalyticsAssistant;
use App\Ai\Support\UiMessageParser;
use App\Ai\Tools\ExportData;
use App\Ai\Tools\ExportReport;
use App\Ai\Tools\ListExpenses;
use App\Ai\Tools\RenderUi;
use App\Enums\TeamRole;
use App\Models\Team;
use App\Models\TeamExpense;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Ai\Files\Base64Document;
use Laravel\Ai\Files\Base64Image;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Tools\Request as ToolRequest;

// Prime the OpenRouter model catalogue so the controller never hits the network
// during tests (App\Ai\OpenRouterModels reads through this cache key).
beforeEach(function () {
    Cache::put('ai.openrouter.tool_models', collect([
        ['id' => 'openai/gpt-4o-mini', 'name' => 'GPT-4o mini', 'vision' => true],
        ['id' => 'anthropic/claude-haiku-4.5', 'name' => 'Claude Haiku 4.5', 'vision' => false],
    ]), 60);
});

test('guests cannot use the assistant', function () {
    $this->postJson(route('ai.chat'), [
        'messages' => [['role' => 'user', 'parts' => [['type' => 'text', 'text' => 'hi']]]],
    ])->assertUnauthorized();
});

test('the assistant rejects a model outside the catalogue', function () {
    [$user] = createTeamMember(TeamRole::Member);

    $this->actingAs($user)->postJson(route('ai.chat'), [
        'messages' => [['role' => 'user', 'parts' => [['type' => 'text', 'text' => 'hi']]]],
        'model' => 'totally-not-a-real-model',
    ])->assertStatus(422)->assertJsonValidationErrors('model');
});

test('guests cannot list models', function () {
    $this->getJson(route('ai.models'))->assertUnauthorized();
});

test('the model catalogue endpoint returns tool-capable models', function () {
    [$user] = createTeamMember();

    $this->actingAs($user)
        ->getJson(route('ai.models'))
        ->assertOk()
        ->assertJsonPath('default', config('chat.default_model'))
        ->assertJsonPath('models.0.id', 'openai/gpt-4o-mini');
});

test('the assistant requires at least one message', function () {
    [$user] = createTeamMember();

    $this->actingAs($user)->postJson(route('ai.chat'), [
        'messages' => [],
    ])->assertStatus(422)->assertJsonValidationErrors('messages');
});

test('the assistant only exposes read-only analytics tools', function () {
    $team = Team::factory()->create();

    $tools = collect((new AnalyticsAssistant($team))->tools())
        ->map(fn ($tool) => class_basename($tool));

    expect($tools->all())->toEqualCanonicalizing([
        'GetPnlReport',
        'GetKeyMetrics',
        'GetDispatcherRankings',
        'ListDriverConfigs',
        'ListExpenses',
        'DescribeSchema',
        'QueryAnalytics',
        'RenderUi',
        'ExportData',
        'ExportReport',
    ]);
});

test('export_data exposes only spreadsheet formats', function () {
    $tool = new ExportData;

    expect($tool->name())->toBe('export_data');

    $output = $tool->handle(new ToolRequest([
        'columns' => ['Driver', 'Net'],
        'rows' => [['Dustin', 37517]],
        'formats' => ['csv', 'pdf', 'bogus'],
    ]));

    // pdf/bogus are dropped — export_data is spreadsheet-only.
    expect(json_decode((string) $output, true))
        ->toBe(['exported' => true, 'formats' => ['csv']]);
});

test('export_report exposes only document formats', function () {
    $tool = new ExportReport;

    expect($tool->name())->toBe('export_report');

    $output = $tool->handle(new ToolRequest([
        'title' => 'Management Report',
        'markdown' => '# Report',
        'formats' => ['pdf', 'csv'],
    ]));

    // csv is dropped — export_report is document-only.
    expect(json_decode((string) $output, true))
        ->toBe(['exported' => true, 'formats' => ['pdf']]);
});

test('the render_ui tool is named render_ui and acknowledges JSX', function () {
    $tool = new RenderUi;

    expect($tool->name())->toBe('render_ui');

    $output = $tool->handle(new ToolRequest([
        'jsx' => '<Card><CardContent><BarChart data={[]} /></CardContent></Card>',
    ]));

    expect(json_decode((string) $output, true))->toBe(['rendered' => true]);
});

test('guests cannot load conversation history', function () {
    $this->getJson(route('ai.conversation'))->assertUnauthorized();
});

test('conversation history is empty for a user with no conversations', function () {
    [$user] = createTeamMember();

    $this->actingAs($user)
        ->getJson(route('ai.conversation'))
        ->assertOk()
        ->assertExactJson(['conversation' => null, 'title' => null, 'messages' => []]);
});

test('guests cannot list conversations', function () {
    $this->getJson(route('ai.conversations'))->assertUnauthorized();
});

test('the conversation list returns the user\'s chats newest-first', function () {
    [$user] = createTeamMember();

    Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'Older chat',
        'updated_at' => now()->subDay(),
    ]);
    Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'Newer chat',
        'updated_at' => now(),
    ]);

    $titles = $this->actingAs($user)
        ->getJson(route('ai.conversations'))
        ->assertOk()
        ->json('conversations.*.title');

    expect($titles)->toBe(['Newer chat', 'Older chat']);
});

test('a specific conversation can be loaded by id, but not another user\'s', function () {
    [$user] = createTeamMember();
    [$other] = createTeamMember();

    $mine = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'My chat',
    ]);
    ConversationMessage::create([
        'id' => 'm1',
        'conversation_id' => $mine->id,
        'user_id' => $user->id,
        'agent' => AnalyticsAssistant::class,
        'role' => 'user',
        'content' => 'Hello',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ]);

    $theirs = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $other->id,
        'title' => 'Their chat',
    ]);

    $this->actingAs($user)
        ->getJson(route('ai.conversation', ['conversation' => $mine->id]))
        ->assertOk()
        ->assertJsonPath('conversation', $mine->id)
        ->assertJsonPath('title', 'My chat')
        ->assertJsonPath('messages.0.parts.0.text', 'Hello');

    // Another user's conversation must not be readable.
    $this->actingAs($user)
        ->getJson(route('ai.conversation', ['conversation' => $theirs->id]))
        ->assertOk()
        ->assertExactJson(['conversation' => null, 'title' => null, 'messages' => []]);
});

test('conversation history maps stored messages into useChat parts', function () {
    [$user] = createTeamMember();

    $conversation = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'P&L chat',
    ]);

    ConversationMessage::create([
        'id' => 'm1',
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => AnalyticsAssistant::class,
        'role' => 'user',
        'content' => 'What was our P&L last week?',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ]);

    ConversationMessage::create([
        'id' => 'm2',
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => AnalyticsAssistant::class,
        'role' => 'assistant',
        'content' => 'Net was $12,500.',
        'attachments' => [],
        'tool_calls' => [[
            'id' => 'call_1',
            'name' => 'get_pnl_report',
            'arguments' => ['start_date' => '2026-05-12'],
        ]],
        'tool_results' => [[
            'id' => 'call_1',
            'name' => 'get_pnl_report',
            'arguments' => ['start_date' => '2026-05-12'],
            'result' => ['net' => 12500],
        ]],
        'usage' => [],
        'meta' => [],
    ]);

    $response = $this->actingAs($user)
        ->getJson(route('ai.conversation'))
        ->assertOk();

    $messages = $response->json('messages');

    expect($messages)->toHaveCount(2)
        ->and($messages[0]['role'])->toBe('user')
        ->and($messages[0]['parts'][0])->toBe(['type' => 'text', 'text' => 'What was our P&L last week?'])
        ->and($messages[1]['role'])->toBe('assistant')
        ->and($messages[1]['parts'][0]['type'])->toBe('tool-get_pnl_report')
        ->and($messages[1]['parts'][0]['state'])->toBe('output-available')
        ->and($messages[1]['parts'][0]['output'])->toBe(['net' => 12500])
        ->and($messages[1]['parts'][1])->toBe(['type' => 'text', 'text' => 'Net was $12,500.']);
});

test('a user can rename their own conversation but not another user\'s', function () {
    [$user] = createTeamMember();
    [$other] = createTeamMember();

    $mine = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'Old title',
    ]);
    $theirs = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $other->id,
        'title' => 'Theirs',
    ]);

    $this->actingAs($user)
        ->patchJson(route('ai.conversations.rename', $mine), ['title' => 'New title'])
        ->assertOk()
        ->assertJsonPath('title', 'New title');

    expect($mine->fresh()->title)->toBe('New title');

    $this->actingAs($user)
        ->patchJson(route('ai.conversations.rename', $theirs), ['title' => 'Hacked'])
        ->assertNotFound();

    expect($theirs->fresh()->title)->toBe('Theirs');
});

test('renaming requires a title', function () {
    [$user] = createTeamMember();

    $conversation = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'Keep me',
    ]);

    $this->actingAs($user)
        ->patchJson(route('ai.conversations.rename', $conversation), ['title' => ''])
        ->assertStatus(422)
        ->assertJsonValidationErrors('title');
});

test('a user can delete their own conversation and its messages', function () {
    [$user] = createTeamMember();

    $conversation = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'title' => 'Delete me',
    ]);
    ConversationMessage::create([
        'id' => 'm1',
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => AnalyticsAssistant::class,
        'role' => 'user',
        'content' => 'Hi',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($user)
        ->deleteJson(route('ai.conversations.destroy', $conversation))
        ->assertOk()
        ->assertJsonPath('deleted', $conversation->id);

    expect(Conversation::whereKey($conversation->id)->exists())->toBeFalse()
        ->and(ConversationMessage::where('conversation_id', $conversation->id)->exists())->toBeFalse();
});

test('a user cannot delete another user\'s conversation', function () {
    [$user] = createTeamMember();
    [$other] = createTeamMember();

    $theirs = Conversation::create([
        'id' => (string) Str::uuid7(),
        'user_id' => $other->id,
        'title' => 'Theirs',
    ]);

    $this->actingAs($user)
        ->deleteJson(route('ai.conversations.destroy', $theirs))
        ->assertNotFound();

    expect(Conversation::whereKey($theirs->id)->exists())->toBeTrue();
});

test('the message parser extracts text and file attachments', function () {
    $pngBase64 = base64_encode('fake-png-bytes');
    $pdfBase64 = base64_encode('fake-pdf-bytes');

    $message = [
        'role' => 'user',
        'parts' => [
            ['type' => 'text', 'text' => 'Look at these'],
            ['type' => 'file', 'mediaType' => 'image/png', 'filename' => 'chart.png', 'url' => "data:image/png;base64,{$pngBase64}"],
            ['type' => 'file', 'mediaType' => 'application/pdf', 'filename' => 'report.pdf', 'url' => "data:application/pdf;base64,{$pdfBase64}"],
        ],
    ];

    expect(UiMessageParser::text($message))->toBe('Look at these');

    $attachments = UiMessageParser::attachments($message);

    expect($attachments)->toHaveCount(2)
        ->and($attachments[0])->toBeInstanceOf(Base64Image::class)
        ->and($attachments[0]->mime)->toBe('image/png')
        ->and($attachments[0]->base64)->toBe($pngBase64)
        ->and($attachments[1])->toBeInstanceOf(Base64Document::class)
        ->and($attachments[1]->mime)->toBe('application/pdf');
});

test('the message parser ignores non-data-url file parts', function () {
    $message = [
        'role' => 'user',
        'parts' => [
            ['type' => 'file', 'mediaType' => 'image/png', 'url' => 'https://example.com/x.png'],
        ],
    ];

    expect(UiMessageParser::attachments($message))->toBe([]);
});

test('the list-expenses tool returns the team expenses as JSON', function () {
    $team = Team::factory()->create();
    TeamExpense::factory()->for($team)->flat('Truck Payment', 350)->create();

    $output = (new ListExpenses($team))->handle(new ToolRequest([]));
    $data = json_decode((string) $output, true);

    expect($data['team'])->toBe($team->name)
        ->and($data['expense_count'])->toBe(1)
        ->and($data['expenses'][0]['name'])->toBe('Truck Payment')
        ->and($data['expenses'][0]['type'])->toBe('flat');
});
