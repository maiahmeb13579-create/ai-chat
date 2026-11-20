import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  FileText,
  Loader2,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { MessageText } from "./components/MessageText";

interface Thread {
  id: string;
  title: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  fileName?: string;
  previewUrl?: string;
  isImage?: boolean;
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const headerTitle = activeThread ? activeThread.title : "New Chat";

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads");
      if (!res.ok) return;
      const data = (await res.json()) as Thread[];
      setThreads(data);
    } catch {
      // Ignore silent background load error
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const clearSelectedFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFilePick = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      setError(null);

      if (!ALLOWED_TYPES.has(file.type)) {
        setError("Please attach a JPEG, PNG, WebP image, or a PDF document.");
        return;
      }

      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        setError("File must be non-empty and under 5 MB.");
        return;
      }

      setFilePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      });
      setSelectedFile(file);
    },
    [],
  );

  const handleNewChat = useCallback(() => {
    if (isSending) return;
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }, [isSending]);

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      if (isSending) return;
      setSidebarOpen(false);
      setError(null);
      setActiveThreadId(threadId);
      setIsLoadingMessages(true);

      try {
        const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`);
        if (!res.ok) {
          throw new Error("Could not load conversation.");
        }
        const data = (await res.json()) as Array<{
          role: "user" | "assistant";
          text: string;
          fileName?: string;
        }>;

        setMessages(
          data.map((m, idx) => ({
            id: `${threadId}-${idx}`,
            role: m.role,
            text: m.text,
            fileName: m.fileName,
          })),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load messages.",
        );
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [isSending],
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !selectedFile) || isSending) return;

    setError(null);
    setIsSending(true);

    const fileToSend = selectedFile;
    const localImageUrl =
      fileToSend && fileToSend.type.startsWith("image/")
        ? URL.createObjectURL(fileToSend)
        : undefined;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: trimmed || (fileToSend ? "Describe this travel attachment." : ""),
      fileName: fileToSend?.name,
      previewUrl: localImageUrl,
      isImage: Boolean(localImageUrl),
    };

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMsgId, role: "assistant", text: "" },
    ]);

    setInput("");
    clearSelectedFile();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      let targetThreadId = activeThreadId;

      if (!targetThreadId) {
        const createRes = await fetch("/api/threads", { method: "POST" });
        if (!createRes.ok) {
          throw new Error("Failed to create conversation.");
        }
        const created = (await createRes.json()) as Thread;
        targetThreadId = created.id;
        setActiveThreadId(created.id);
        setThreads((prev) => [...prev, created]);
      }

      const formData = new FormData();
      formData.append("thread_id", targetThreadId);
      formData.append("message", trimmed);
      if (fileToSend) {
        formData.append("file", fileToSend);
      }

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        let errText = "Request failed.";
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson.error) errText = errJson.error;
        } catch {
          // Ignore parse failure
        }
        throw new Error(errText);
      }

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventChunk of events) {
            const line = eventChunk
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!line) continue;

            const payload = JSON.parse(line.slice(6)) as {
              type: "delta" | "done" | "error";
              text?: string;
              title?: string;
              thread_id?: string;
              error?: string;
            };

            if (payload.type === "error") {
              throw new Error(payload.error || "Failed to generate reply.");
            }

            if (payload.type === "delta" && payload.text) {
              accumulated += payload.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: accumulated } : m,
                ),
              );
            }

            if (payload.type === "done" && payload.title && targetThreadId) {
              const updatedTitle = payload.title;
              setThreads((prev) =>
                prev.map((t) =>
                  t.id === targetThreadId ? { ...t, title: updatedTitle } : t,
                ),
              );
            }
          }
        }
      } else {
        const data = (await res.json()) as {
          reply: string;
          title?: string;
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, text: data.reply } : m,
          ),
        );
        if (data.title && targetThreadId) {
          const updatedTitle = data.title;
          setThreads((prev) =>
            prev.map((t) =>
              t.id === targetThreadId ? { ...t, title: updatedTitle } : t,
            ),
          );
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(msg);
      setMessages((prev) =>
        prev.filter((m) => !(m.id === assistantMsgId && m.text.length === 0)),
      );
    } finally {
      setIsSending(false);
    }
  }, [activeThreadId, clearSelectedFile, input, isSending, selectedFile]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFilePick(file);
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFilePick(file);
  };

  const canSend = (input.trim().length > 0 || selectedFile !== null) && !isSending;

  return (
    <div
      className="relative flex h-full w-full flex-col bg-[#FAF9F5] text-[#1E201D]"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {/* Top Bar */}
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-[#EAE8E1] bg-[#FAF9F5] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle conversations"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4B4E49] transition-colors hover:bg-[#EFECE3] hover:text-[#1E201D] cursor-pointer"
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <h1 className="truncate text-[15px] font-medium text-[#1E201D]">
            {headerTitle}
          </h1>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          disabled={isSending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DDDAD0] bg-[#FAF9F5] px-3.5 py-1.5 text-[13.5px] font-medium text-[#1E201D] transition-colors hover:bg-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5 text-[#4B4E49]" strokeWidth={2} />
          <span>New chat</span>
        </button>
      </header>

      {/* Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/15 transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-over Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[#E6E3D9] bg-[#F4F2EB] transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Conversations"
      >
        <div className="flex h-[58px] items-center justify-between border-b border-[#E6E3D9] px-4">
          <span className="text-[14px] font-semibold text-[#1E201D]">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5B5E58] transition-colors hover:bg-[#E8E5DC] hover:text-[#1E201D] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-lg border border-[#DCD9CE] bg-[#FAF9F5] px-3 py-2 text-[13.5px] font-medium text-[#1E201D] transition-colors hover:bg-white cursor-pointer"
          >
            <Plus className="h-4 w-4 text-[#4B4E49]" />
            <span>New chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {threads.length === 0 ? (
            <p className="px-2 py-4 text-[13px] text-[#787B74]">
              No saved trips yet. Start asking about a destination below.
            </p>
          ) : (
            [...threads].reverse().map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => void handleSelectThread(thread.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors cursor-pointer ${
                    isActive
                      ? "bg-[#E7E4DA] font-medium text-[#1E201D]"
                      : "text-[#4D504A] hover:bg-[#ECE9E0]"
                  }`}
                >
                  <MessageSquare
                    className="h-3.5 w-3.5 shrink-0 text-[#6F726C]"
                    strokeWidth={1.8}
                  />
                  <span dir="auto" className="truncate">
                    {thread.title}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 overflow-y-auto">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#6E726B]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <h2 className="font-editorial text-[34px] sm:text-[38px] font-bold tracking-[-0.015em] text-[#1E201D] leading-tight">
              Where to next?
            </h2>
            <p className="mt-2.5 max-w-md text-[15px] text-[#666963] leading-relaxed">
              Ask about destinations, places to visit, or attach a travel photo or file.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl bg-[#EDEAE0] px-4 py-3 text-[15px] leading-[1.6] text-[#1E201D]">
                    {msg.previewUrl && (
                      <img
                        src={msg.previewUrl}
                        alt={msg.fileName || "Travel attachment"}
                        className="mb-2.5 max-h-60 rounded-xl object-cover"
                      />
                    )}
                    {!msg.previewUrl && msg.fileName && (
                      <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#E4E0D4] px-2.5 py-1.5 text-[13px] text-[#3F423D]">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">{msg.fileName}</span>
                      </div>
                    )}
                    <p dir="auto" className="whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-start">
                  <div className="w-full">
                    {msg.text ? (
                      <MessageText text={msg.text} />
                    ) : (
                      <div className="flex items-center gap-1.5 py-1 text-[14px] text-[#757871]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8FA49C] animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8FA49C] animate-pulse [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8FA49C] animate-pulse [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#FAF9F5]/80 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-dashed border-[#8EA39B] bg-white px-8 py-6 text-center shadow-sm">
            <p className="text-[15px] font-medium text-[#1E201D]">
              Drop a travel photo or PDF here
            </p>
            <p className="mt-1 text-[13px] text-[#6B6E68]">
              JPEG, PNG, WebP, or PDF up to 5 MB
            </p>
          </div>
        </div>
      )}

      {/* Composer */}
      <footer className="shrink-0 bg-[#FAF9F5] px-4 pb-5 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {error && (
            <div className="mb-2.5 flex items-center justify-between rounded-xl border border-[#E5C9C6] bg-[#FDF5F4] px-3.5 py-2 text-[13.5px] text-[#8E352E]">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="ml-3 rounded p-0.5 hover:bg-[#F5E4E2] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-[#E0DDD3] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-colors focus-within:border-[#B6C5BF]">
            {selectedFile && (
              <div className="flex items-center justify-between border-b border-[#EFECE3] px-3.5 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt={selectedFile.name}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover border border-[#E5E2D8]"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F3F1EA] text-[#555852]">
                      <FileText className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#1E201D]">
                      {selectedFile.name}
                    </p>
                    <p className="text-[12px] text-[#7A7D76]">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  aria-label="Remove attachment"
                  className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#6A6D67] transition-colors hover:bg-[#F3F1EA] hover:text-[#1E201D] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 px-3 py-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => handleFilePick(e.target.files?.[0])}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                aria-label="Attach travel photo or PDF"
                title="Attach photo or PDF (max 5 MB)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#6C6F69] transition-colors hover:bg-[#F3F1EA] hover:text-[#1E201D] disabled:opacity-50 cursor-pointer"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask about a place or upload a photo..."
                dir="auto"
                className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-[#1E201D] placeholder:text-[#989B94] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                aria-label="Send message"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  canSend
                    ? "bg-[#557168] text-white hover:bg-[#445C54] cursor-pointer"
                    : "bg-[#B7C5BF] text-white/95 cursor-default"
                }`}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2.1} />
                )}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
