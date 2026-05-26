<?php

return [

    /*
    |--------------------------------------------------------------------------
    | AI Assistant Chat
    |--------------------------------------------------------------------------
    |
    | Configuration for the in-app AI assistant. The assistant talks to models
    | through OpenRouter, so users can pick from any tool-capable model in the
    | OpenRouter catalogue (see App\Ai\OpenRouterModels). `default_model` is the
    | OpenRouter model id used when the client doesn't choose one.
    |
    */

    'default_model' => env('AI_CHAT_MODEL', 'openai/gpt-4o-mini'),

];
