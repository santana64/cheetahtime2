"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { CheetahSoftOfficialLogo } from "@/components/app/brand-mark";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Quelles sont les priorités d'action immédiates ?",
  "Quels risques menacent le planning ?",
  "Comment optimiser le chemin critique ?",
  "Analyse les ressources en surcharge.",
];

export function AiAssistant({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/ai-assist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply ?? "Aucune réponse." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Erreur réseau. Réessayez." }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-200 hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #1a4a20 0%, #0e2714 100%)",
          border: "2px solid rgba(86,164,91,0.50)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.30), 0 0 24px rgba(86,164,91,0.20)",
        }}
        aria-label="Assistant IA CheetahSoft"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="9" stroke="rgba(86,164,91,0.70)" strokeWidth="1.5" />
            <path d="M7 9h8M7 12h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="17" cy="5" r="3" fill="#f4a321" />
            <path d="M16 5h2M17 4v2" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #0d1f10 0%, #0a1a0d 100%)",
            border: "1px solid rgba(86,164,91,0.25)",
            height: "480px",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex shrink-0 items-center justify-center">
              <Image src="/cheetahsoft-logo.jpg" alt="CheetahSoft" width={34} height={34} style={{ borderRadius: "50%" }} />
            </div>
            <div className="leading-none">
              <div className="text-[12px] font-black text-white">Assistant IA</div>
              <div className="text-[10px] text-white/40">CheetahSoft · Cheetah Time</div>
            </div>
            <div className="ml-auto flex h-2 w-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] text-white/40">Posez une question sur votre projet ou choisissez une suggestion :</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="w-full rounded-xl px-3 py-2 text-left text-[11px] font-medium transition-all hover:opacity-80"
                    style={{ background: "rgba(86,164,91,0.12)", border: "1px solid rgba(86,164,91,0.20)", color: "rgba(255,255,255,0.75)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-[12px] leading-5 ${
                  msg.role === "user"
                    ? "ml-6 text-right"
                    : "mr-6"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "rgba(86,164,91,0.18)", color: "rgba(255,255,255,0.85)" }
                    : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }
                }
              >
                {msg.role === "assistant" && (
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/70">Cheetah AI</div>
                )}
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
              </div>
            ))}
            {loading && (
              <div className="mr-6 rounded-xl px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="block h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400/60"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Question sur le projet…"
              disabled={loading}
              className="flex-1 rounded-xl bg-white/8 px-3 py-2 text-[12px] text-white placeholder-white/30 outline-none"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:opacity-40 hover:opacity-80"
              style={{ background: "rgba(86,164,91,0.30)", border: "1px solid rgba(86,164,91,0.40)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 7h12M8 3l5 4-5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
