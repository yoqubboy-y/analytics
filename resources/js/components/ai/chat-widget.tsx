import { useChat } from '@ai-sdk/react';
import { usePage } from '@inertiajs/react';
import { DefaultChatTransport } from 'ai';
import type {
    DynamicToolUIPart,
    FileUIPart,
    ToolUIPart,
    UIMessage,
} from 'ai';
import {
    BrainIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronsRightIcon,
    CopyIcon,
    EyeIcon,
    FileTextIcon,
    PaperclipIcon,
    PencilIcon,
    RefreshCcwIcon,
    SparklesIcon,
    SquarePenIcon,
    Trash2Icon,
    XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    ArtifactCard,
    ArtifactPanel
    
} from '@/components/ai/artifact-panel';
import type {ArtifactData} from '@/components/ai/artifact-panel';
import { UiPreview } from '@/components/ai/ui-preview';
import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import {
    Message,
    MessageAction,
    MessageActions,
    MessageContent,
    MessageResponse,
} from '@/components/ai-elements/message';
import {
    PromptInput,
    PromptInputBody,
    PromptInputButton,
    PromptInputFooter,
    PromptInputHeader,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputTools,
    usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
} from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type {
    Cell,
    DocumentFormat,
    SpreadsheetFormat,
} from '@/lib/exporters';
import { cn } from '@/lib/utils';

type AiModel = {
    id: string;
    name: string;
    description: string | null;
    context_length: number;
    vision: boolean;
    pricing: { prompt: number | null; completion: number | null };
};
type ChatSummary = { id: string; title: string; updated_at: string | null };

const MIN_WIDTH = 400;
const SUGGESTIONS = [
    'What was our P&L last week?',
    'Who are the top dispatchers this month?',
    'Show key metrics for the current week',
    'List our active drivers and their rates',
];

/** Read Laravel's XSRF-TOKEN cookie so mutating requests pass CSRF. */
function xsrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);

    return match ? decodeURIComponent(match[1]) : '';
}

const jsonGet = (url: string) =>
    fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });

const jsonSend = (url: string, method: string, body?: unknown) =>
    fetch(url, {
        method,
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

/** Join a message's text parts (for the copy action). */
function messageText(message: UIMessage): string {
    return message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n');
}

/** Render a tool part: render_ui → live preview, everything else → Tool panel. */
function renderToolPart(
    part: UIMessage['parts'][number],
    key: string,
    isStreaming: boolean,
    onOpenArtifact: (data: ArtifactData) => void,
) {
    if (part.type === 'tool-render_ui') {
        const input = ((part as ToolUIPart).input ?? {}) as {
            jsx?: string;
            title?: string;
        };

        if (!input.jsx) {
            return (
                <div
                    key={key}
                    className="my-2 text-xs text-muted-foreground italic"
                >
                    Building UI…
                </div>
            );
        }

        const jsx = input.jsx;
        const title = input.title ?? 'Result';

        return (
            <UiPreview
                key={key}
                jsx={jsx}
                title={input.title}
                isStreaming={isStreaming}
                onExpand={
                    isStreaming
                        ? undefined
                        : () => onOpenArtifact({ kind: 'ui', title, jsx })
                }
            />
        );
    }

    if (part.type === 'tool-export_data') {
        const input = ((part as ToolUIPart).input ?? {}) as {
            title?: string;
            filename?: string;
            columns?: string[];
            rows?: Cell[][];
            formats?: SpreadsheetFormat[];
        };

        const data: ArtifactData = {
            kind: 'table',
            title: input.title ?? 'Export',
            filename: input.filename,
            columns: Array.isArray(input.columns) ? input.columns : [],
            rows: Array.isArray(input.rows) ? input.rows : [],
            formats: input.formats,
        };

        return (
            <ArtifactCard
                key={key}
                data={data}
                onOpen={() => onOpenArtifact(data)}
            />
        );
    }

    if (part.type === 'tool-export_report') {
        const input = ((part as ToolUIPart).input ?? {}) as {
            title?: string;
            filename?: string;
            markdown?: string;
            formats?: DocumentFormat[];
        };

        const data: ArtifactData = {
            kind: 'report',
            title: input.title ?? 'Report',
            filename: input.filename,
            markdown: typeof input.markdown === 'string' ? input.markdown : '',
            formats: input.formats,
        };

        return (
            <ArtifactCard
                key={key}
                data={data}
                onOpen={() => onOpenArtifact(data)}
            />
        );
    }

    if (part.type === 'dynamic-tool') {
        const tool = part as DynamicToolUIPart;

        return (
            <Tool key={key}>
                <ToolHeader
                    type="dynamic-tool"
                    state={tool.state}
                    toolName={tool.toolName}
                />
                <ToolContent>
                    <ToolInput input={tool.input} />
                    <ToolOutput output={tool.output} errorText={tool.errorText} />
                </ToolContent>
            </Tool>
        );
    }

    if (part.type.startsWith('tool-')) {
        const tool = part as ToolUIPart;

        return (
            <Tool key={key}>
                <ToolHeader type={tool.type} state={tool.state} />
                <ToolContent>
                    <ToolInput input={tool.input} />
                    <ToolOutput output={tool.output} errorText={tool.errorText} />
                </ToolContent>
            </Tool>
        );
    }

    return null;
}

function priceLabel(model: AiModel): string {
    const prompt = model.pricing.prompt;

    if (prompt === null) {
        return '';
    }

    return prompt === 0 ? 'Free' : `$${prompt}/M in`;
}

/** Searchable picker over the tool-capable OpenRouter catalogue. */
function ModelPicker({
    models,
    value,
    onChange,
}: {
    models: AiModel[];
    value: string;
    onChange: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const selected = models.find((model) => model.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 max-w-44 gap-1 px-2 text-xs font-normal text-muted-foreground"
                >
                    <span className="truncate">
                        {selected?.name ?? value ?? 'Model'}
                    </span>
                    <ChevronDownIcon className="size-3.5 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
                <Command>
                    <CommandInput placeholder="Search models…" />
                    <CommandList>
                        <CommandEmpty>
                            {models.length === 0
                                ? 'Loading models…'
                                : 'No models found.'}
                        </CommandEmpty>
                        {models.map((model) => (
                            <CommandItem
                                key={model.id}
                                value={`${model.name} ${model.id}`}
                                onSelect={() => {
                                    onChange(model.id);
                                    setOpen(false);
                                }}
                                className="flex items-start gap-2"
                            >
                                <CheckIcon
                                    className={cn(
                                        'mt-0.5 size-4 shrink-0',
                                        model.id === value
                                            ? 'opacity-100'
                                            : 'opacity-0',
                                    )}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm">
                                            {model.name}
                                        </span>
                                        {model.vision && (
                                            <EyeIcon className="size-3 shrink-0 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {[
                                            model.context_length
                                                ? `${Math.round(model.context_length / 1000)}K ctx`
                                                : null,
                                            priceLabel(model),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </div>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

/** Title-bar chat switcher: lists recent chats with rename + delete. */
function ChatSwitcher({
    activeId,
    title,
    onNew,
    onSelect,
    onDeleted,
    onRenamed,
}: {
    activeId: string | null;
    title: string;
    onNew: () => void;
    onSelect: (chat: ChatSummary) => void;
    onDeleted: (id: string) => void;
    onRenamed: (id: string, title: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<ChatSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [renameTarget, setRenameTarget] = useState<ChatSummary | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setConfirmId(null);

        void jsonGet('/ai/conversations')
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { conversations?: ChatSummary[] } | null) =>
                setItems(data?.conversations ?? []),
            )
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, []);

    function handleDelete(id: string) {
        void jsonSend(`/ai/conversations/${id}`, 'DELETE').then((response) => {
            if (response.ok) {
                setItems((current) => current.filter((c) => c.id !== id));
                onDeleted(id);
            }
        });
    }

    function submitRename() {
        if (!renameTarget) {
            return;
        }

        const id = renameTarget.id;
        const next = renameValue.trim();

        if (!next) {
            return;
        }

        void jsonSend(`/ai/conversations/${id}`, 'PATCH', { title: next }).then(
            (response) => {
                if (response.ok) {
                    setItems((current) =>
                        current.map((c) =>
                            c.id === id ? { ...c, title: next } : c,
                        ),
                    );
                    onRenamed(id, next);
                }

                setRenameTarget(null);
            },
        );
    }

    return (
        <>
            <Popover
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);

                    if (next) {
                        load();
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 max-w-52 gap-1 px-2 text-sm font-medium"
                    >
                        <span className="truncate">{title}</span>
                        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-1">
                    <button
                        type="button"
                        onClick={() => {
                            onNew();
                            setOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                        <SquarePenIcon className="size-4" />
                        New chat
                    </button>

                    <div className="my-1 border-t" />
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                        Recent chats
                    </p>

                    <div className="max-h-72 overflow-y-auto">
                        {loading && (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                Loading…
                            </p>
                        )}
                        {!loading && items.length === 0 && (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                No chats yet
                            </p>
                        )}
                        {!loading &&
                            items.map((chat) => (
                                <div
                                    key={chat.id}
                                    className={cn(
                                        'group flex items-center gap-1 rounded-sm pr-1 hover:bg-accent',
                                        chat.id === activeId && 'bg-accent',
                                    )}
                                >
                                    {confirmId === chat.id ? (
                                        <div className="flex flex-1 items-center justify-between gap-2 px-2 py-1.5 text-sm">
                                            <span className="text-muted-foreground">
                                                Delete chat?
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDelete(chat.id)
                                                    }
                                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                                                >
                                                    Delete
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setConfirmId(null)
                                                    }
                                                    className="rounded px-1.5 py-0.5 text-xs hover:bg-background"
                                                >
                                                    Cancel
                                                </button>
                                            </span>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSelect(chat);
                                                    setOpen(false);
                                                }}
                                                className="flex-1 truncate px-2 py-1.5 text-left text-sm"
                                            >
                                                {chat.title}
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Rename chat"
                                                onClick={() => {
                                                    setRenameTarget(chat);
                                                    setRenameValue(chat.title);
                                                    setOpen(false);
                                                }}
                                                className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                                            >
                                                <PencilIcon className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Delete chat"
                                                onClick={() =>
                                                    setConfirmId(chat.id)
                                                }
                                                className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                                            >
                                                <Trash2Icon className="size-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog
                open={renameTarget !== null}
                onOpenChange={(next) => !next && setRenameTarget(null)}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Rename chat</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                submitRename();
                            }
                        }}
                        placeholder="Chat title"
                        autoFocus
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRenameTarget(null)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" onClick={submitRename}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** Attachment chips shown above the textarea while composing. */
function AttachmentPreviews() {
    const attachments = usePromptInputAttachments();

    if (attachments.files.length === 0) {
        return null;
    }

    return (
        <PromptInputHeader>
            {attachments.files.map((file) => (
                <span
                    key={file.id}
                    className="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs"
                >
                    {file.mediaType?.startsWith('image/') ? (
                        <img
                            src={file.url}
                            alt={file.filename ?? ''}
                            className="size-4 rounded-sm object-cover"
                        />
                    ) : (
                        <FileTextIcon className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="max-w-32 truncate">{file.filename}</span>
                    <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => attachments.remove(file.id)}
                        className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <XIcon className="size-3" />
                    </button>
                </span>
            ))}
        </PromptInputHeader>
    );
}

/** Paperclip button that opens the native file picker. */
function AddAttachmentButton({ disabled }: { disabled: boolean }) {
    const attachments = usePromptInputAttachments();

    return (
        <PromptInputButton
            onClick={attachments.openFileDialog}
            disabled={disabled}
            tooltip={
                disabled
                    ? 'This model can’t read images or files'
                    : 'Attach images or PDFs'
            }
            aria-label="Attach files"
        >
            <PaperclipIcon className="size-4" />
        </PromptInputButton>
    );
}

export function ChatWidget() {
    const page = usePage<{ ai?: { defaultModel: string } }>();
    const defaultModel = page.props.ai?.defaultModel ?? 'openai/gpt-4o-mini';

    const [open, setOpen] = useState(false);
    const [models, setModels] = useState<AiModel[]>([]);
    const [model, setModel] = useState(() => {
        try {
            return localStorage.getItem('ai-chat-model') ?? defaultModel;
        } catch {
            return defaultModel;
        }
    });
    const [activeId, setActiveId] = useState<string | null>(null);
    const [title, setTitle] = useState('New AI chat');
    const [artifact, setArtifact] = useState<ArtifactData | null>(null);
    const [width, setWidth] = useState(() => {
        try {
            const saved = Number(localStorage.getItem('ai-chat-width'));

            return Number.isFinite(saved) && saved >= MIN_WIDTH
                ? saved
                : MIN_WIDTH;
        } catch {
            return MIN_WIDTH;
        }
    });

    const freshRef = useRef(false);
    const expectNewIdRef = useRef(false);
    const loadedRef = useRef(false);
    const modelsLoadedRef = useRef(false);
    const prevStatusRef = useRef('ready');

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: '/ai/chat',
                credentials: 'include',
                headers: () => ({ 'X-XSRF-TOKEN': xsrfToken() }),
            }),
        [],
    );

    const { messages, sendMessage, setMessages, status, stop, regenerate } =
        useChat({
            transport,
        });

    const busy = status === 'submitted' || status === 'streaming';
    const selectedModel = models.find((m) => m.id === model);
    const canAttach = !selectedModel || selectedModel.vision;

    const setAndStoreModel = useCallback((id: string) => {
        setModel(id);

        try {
            localStorage.setItem('ai-chat-model', id);
        } catch {
            // Persistence is best-effort.
        }
    }, []);

    const loadConversation = useCallback(
        (id: string | null) => {
            const url = id
                ? `/ai/conversation?conversation=${encodeURIComponent(id)}`
                : '/ai/conversation';

            void jsonGet(url)
                .then((response) => (response.ok ? response.json() : null))
                .then(
                    (
                        data: {
                            conversation?: string | null;
                            title?: string | null;
                            messages?: UIMessage[];
                        } | null,
                    ) => {
                        setMessages(data?.messages ?? []);
                        setActiveId(data?.conversation ?? null);
                        setTitle(data?.title ?? 'New AI chat');
                    },
                )
                .catch(() => {
                    // History is best-effort; a fresh panel is a fine fallback.
                });
        },
        [setMessages],
    );

    // Lazily load history + model catalogue the first time the panel opens.
    useEffect(() => {
        if (!open) {
            return;
        }

        if (!loadedRef.current) {
            loadedRef.current = true;
            loadConversation(null);
        }

        if (!modelsLoadedRef.current) {
            modelsLoadedRef.current = true;
            void jsonGet('/ai/models')
                .then((response) => (response.ok ? response.json() : null))
                .then((data: { models?: AiModel[] } | null) =>
                    setModels(data?.models ?? []),
                )
                .catch(() => setModels([]));
        }
    }, [open, loadConversation]);

    // After a send that created a brand-new conversation, learn its id + title.
    useEffect(() => {
        const previous = prevStatusRef.current;
        prevStatusRef.current = status;

        if (
            previous === 'ready' ||
            status !== 'ready' ||
            !expectNewIdRef.current
        ) {
            return;
        }

        expectNewIdRef.current = false;

        void jsonGet('/ai/conversations')
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { conversations?: ChatSummary[] } | null) => {
                const newest = data?.conversations?.[0];

                if (newest) {
                    setActiveId(newest.id);
                    setTitle(newest.title);
                }
            })
            .catch(() => {
                // Non-critical — the chat still works without the resolved id.
            });
    }, [status]);

    const submit = useCallback(
        (text: string, files?: FileUIPart[]) => {
            const trimmed = text.trim();

            if ((!trimmed && !files?.length) || busy) {
                return;
            }

            if (freshRef.current || activeId === null) {
                expectNewIdRef.current = true;
            }

            sendMessage(
                { text: trimmed, files },
                {
                    body: {
                        model,
                        fresh: freshRef.current,
                        conversation: activeId ?? undefined,
                    },
                },
            );

            freshRef.current = false;
        },
        [busy, model, sendMessage, activeId],
    );

    function handleSubmit(message: PromptInputMessage) {
        submit(message.text ?? '', message.files);
    }

    function handleNewChat() {
        stop();
        setMessages([]);
        setActiveId(null);
        setTitle('New AI chat');
        setArtifact(null);
        freshRef.current = true;
        expectNewIdRef.current = false;
    }

    function handleSelectChat(chat: ChatSummary) {
        stop();
        freshRef.current = false;
        expectNewIdRef.current = false;
        setArtifact(null);
        setTitle(chat.title);
        loadConversation(chat.id);
    }

    function handleDeletedChat(id: string) {
        if (id === activeId) {
            handleNewChat();
        }
    }

    function handleRenamedChat(id: string, next: string) {
        if (id === activeId) {
            setTitle(next);
        }
    }

    function handleRegenerate() {
        if (busy) {
            return;
        }

        void regenerate({
            body: {
                model,
                conversation: activeId ?? undefined,
                regenerate: true,
            },
        });
    }

    function copyText(text: string) {
        void navigator.clipboard?.writeText(text);
    }

    function startResize(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault();

        const startX = event.clientX;
        const startWidth = width;
        let latest = startWidth;

        const onMove = (move: PointerEvent) => {
            const maxWidth = Math.min(820, Math.round(window.innerWidth * 0.7));
            latest = Math.min(
                maxWidth,
                Math.max(MIN_WIDTH, startWidth + (startX - move.clientX)),
            );
            setWidth(latest);
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);

            try {
                localStorage.setItem('ai-chat-width', String(latest));
            } catch {
                // ignore
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    // Esc closes the (non-modal) panel, matching the floating-button toggle.
    useEffect(() => {
        if (!open) {
            return;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            // Close the artifact panel first, then the whole widget.
            setArtifact((current) => {
                if (current) {
                    return null;
                }

                setOpen(false);

                return null;
            });
        };

        document.addEventListener('keydown', onKey);

        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) {
        return (
            <Button
                type="button"
                size="icon"
                aria-label="Open analytics assistant"
                onClick={() => setOpen(true)}
                className="fixed right-4 bottom-4 z-50 h-12 w-12 rounded-full shadow-lg"
            >
                <SparklesIcon className="h-5 w-5" />
            </Button>
        );
    }

    return (
        <aside
            style={{ width }}
            className="sticky top-0 z-30 flex h-svh max-w-[92vw] shrink-0 flex-col self-start border-l bg-background"
        >
            {/* Drag handle to resize the rail (desktop only). */}
            <div
                onPointerDown={startResize}
                className="absolute top-0 left-0 z-10 hidden h-full w-1 -translate-x-1/2 cursor-col-resize hover:bg-primary/40 sm:block"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize assistant panel"
            />

            <header className="flex items-center justify-between gap-1 border-b px-2 py-2">
                <ChatSwitcher
                    activeId={activeId}
                    title={title}
                    onNew={handleNewChat}
                    onSelect={handleSelectChat}
                    onDeleted={handleDeletedChat}
                    onRenamed={handleRenamedChat}
                />

                <div className="flex items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="New chat"
                        title="New chat"
                        onClick={handleNewChat}
                    >
                        <SquarePenIcon className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close assistant"
                        title="Close"
                        onClick={() => setOpen(false)}
                    >
                        <ChevronsRightIcon className="size-4" />
                    </Button>
                </div>
            </header>

            <Conversation className="flex-1">
                <ConversationContent>
                    {messages.length === 0 ? (
                        <ConversationEmptyState>
                            <SparklesIcon className="size-6 text-muted-foreground" />
                            <div className="space-y-1">
                                <h3 className="text-sm font-medium">
                                    Ask about your analytics
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Read-only answers for your current team.
                                </p>
                            </div>
                        </ConversationEmptyState>
                    ) : (
                        messages.map((message, messageIndex) => {
                            const isLast =
                                messageIndex === messages.length - 1;
                            const showActions =
                                message.role === 'assistant' &&
                                isLast &&
                                !busy &&
                                messageText(message).length > 0;

                            return (
                                <Message key={message.id} from={message.role}>
                                    <MessageContent>
                                        {message.parts.map((part, index) => {
                                            const key = `${message.id}-${index}`;

                                            if (part.type === 'text') {
                                                return (
                                                    <MessageResponse key={key}>
                                                        {part.text}
                                                    </MessageResponse>
                                                );
                                            }

                                            if (part.type === 'file') {
                                                const file = part as FileUIPart;

                                                return (
                                                    <span
                                                        key={key}
                                                        className="flex w-fit items-center gap-1.5 rounded-md border bg-background/50 py-1 pr-2 pl-1.5 text-xs"
                                                    >
                                                        {file.mediaType?.startsWith(
                                                            'image/',
                                                        ) ? (
                                                            <img
                                                                src={file.url}
                                                                alt={
                                                                    file.filename ??
                                                                    ''
                                                                }
                                                                className="size-8 rounded object-cover"
                                                            />
                                                        ) : (
                                                            <FileTextIcon className="size-4 text-muted-foreground" />
                                                        )}
                                                        <span className="max-w-40 truncate">
                                                            {file.filename ??
                                                                'attachment'}
                                                        </span>
                                                    </span>
                                                );
                                            }

                                            if (part.type === 'reasoning') {
                                                const streaming =
                                                    status === 'streaming' &&
                                                    isLast;

                                                return (
                                                    <ChainOfThought
                                                        key={key}
                                                        defaultOpen={streaming}
                                                    >
                                                        <ChainOfThoughtHeader>
                                                            {streaming ? (
                                                                <Shimmer>
                                                                    Reasoning…
                                                                </Shimmer>
                                                            ) : (
                                                                'Reasoning'
                                                            )}
                                                        </ChainOfThoughtHeader>
                                                        <ChainOfThoughtContent>
                                                            <ChainOfThoughtStep
                                                                icon={BrainIcon}
                                                                status={
                                                                    streaming
                                                                        ? 'active'
                                                                        : 'complete'
                                                                }
                                                                label={
                                                                    <MessageResponse>
                                                                        {
                                                                            part.text
                                                                        }
                                                                    </MessageResponse>
                                                                }
                                                            />
                                                        </ChainOfThoughtContent>
                                                    </ChainOfThought>
                                                );
                                            }

                                            return renderToolPart(
                                                part,
                                                key,
                                                status === 'streaming',
                                                setArtifact,
                                            );
                                        })}
                                    </MessageContent>

                                    {showActions && (
                                        <MessageActions>
                                            <MessageAction
                                                tooltip="Copy"
                                                onClick={() =>
                                                    copyText(
                                                        messageText(message),
                                                    )
                                                }
                                            >
                                                <CopyIcon className="size-3.5" />
                                            </MessageAction>
                                            <MessageAction
                                                tooltip="Regenerate"
                                                onClick={handleRegenerate}
                                            >
                                                <RefreshCcwIcon className="size-3.5" />
                                            </MessageAction>
                                        </MessageActions>
                                    )}
                                </Message>
                            );
                        })
                    )}

                    {status === 'submitted' && (
                        <Message from="assistant">
                            <MessageContent>
                                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader size={14} />
                                    <Shimmer>Thinking…</Shimmer>
                                </span>
                            </MessageContent>
                        </Message>
                    )}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            {messages.length === 0 && (
                <div className="px-3 pt-1 pb-2">
                    <Suggestions>
                        {SUGGESTIONS.map((suggestion) => (
                            <Suggestion
                                key={suggestion}
                                suggestion={suggestion}
                                onClick={(value) => submit(value)}
                            />
                        ))}
                    </Suggestions>
                </div>
            )}

            <PromptInput
                onSubmit={handleSubmit}
                accept="image/*,application/pdf"
                multiple
                maxFiles={4}
                maxFileSize={10 * 1024 * 1024}
                globalDrop
                className="rounded-none border-x-0 border-b-0"
            >
                <AttachmentPreviews />
                <PromptInputBody>
                    <PromptInputTextarea placeholder="Ask about your team's analytics…" />
                </PromptInputBody>
                <PromptInputFooter>
                    <PromptInputTools>
                        <AddAttachmentButton disabled={!canAttach} />
                        <ModelPicker
                            models={models}
                            value={model}
                            onChange={setAndStoreModel}
                        />
                    </PromptInputTools>
                    <PromptInputSubmit status={status} onStop={stop} />
                </PromptInputFooter>
            </PromptInput>

            {artifact && (
                <ArtifactPanel
                    data={artifact}
                    onClose={() => setArtifact(null)}
                />
            )}
        </aside>
    );
}
