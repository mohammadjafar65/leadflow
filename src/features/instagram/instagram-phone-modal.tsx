import {
  X,
  ChevronRight,
  Phone,
  Video,
  Sparkles,
  Heart,
  ExternalLink,
} from "lucide-react";
import type { IgAccount, IgAutomation } from "@/api/instagram";

interface PhonePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  automation: IgAutomation | null;
  account: IgAccount | null;
}

export function InstagramPhoneModal({
  isOpen,
  onClose,
  automation,
  account,
}: PhonePreviewProps) {
  if (!isOpen) return null;

  const username = account?.username || "leadflow_growth";
  const message =
    automation?.messageTemplate ||
    "Hey there! Thanks for commenting on our Reel. Here is your free blueprint link 👇";
  const buttonLabel = automation?.buttonLabel || "Open Link";
  const linkUrl = automation?.linkUrl;
  const keywords = automation?.keywords ?? ["LINK"];
  const commentReply = automation?.commentReplyTemplate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm w-full animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Realistic Smartphone Mockup */}
        <div className="w-full rounded-[2.8rem] border-[5px] border-slate-700 bg-neutral-950 p-3 shadow-2xl flex flex-col relative text-white">
          {/* Dynamic Island */}
          <div className="w-24 h-4 bg-neutral-900 rounded-full mx-auto mb-2 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
          </div>

          {/* Smartphone Screen */}
          <div className="rounded-[2rem] bg-neutral-900 border border-neutral-800 flex flex-col overflow-hidden text-neutral-100 min-h-[500px] max-h-[560px]">
            {/* Header */}
            <div className="px-3.5 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/90 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 rotate-180 text-neutral-400" />
                <div className="relative p-[1.5px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0">
                  <div className="w-7 h-7 rounded-full bg-neutral-900 flex items-center justify-center text-xs font-bold text-white">
                    {username[0]?.toUpperCase()}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate leading-tight">
                    @{username}
                  </p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1 leading-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active now
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-neutral-400">
                <Phone className="w-3.5 h-3.5" />
                <Video className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3 flex flex-col justify-end text-xs">
              <p className="text-[10px] text-neutral-500 text-center">Today 3:24 PM</p>

              {/* Trigger context */}
              {automation?.triggerType === "comment_to_dm" && (
                <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-2.5 text-[11px] text-neutral-300 space-y-1">
                  <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
                    🎬 Reel Comment Trigger
                  </p>
                  <p>
                    <strong className="text-white">@alex_lead</strong> commented: "
                    <span className="text-purple-300 font-semibold">
                      {keywords[0] || "LINK"}
                    </span>
                    "
                  </p>
                  {commentReply && (
                    <div className="pt-1 mt-1 border-t border-neutral-700 text-[10px] text-neutral-400">
                      <span className="text-emerald-400 font-medium">Public reply: </span>
                      "{commentReply}"
                    </div>
                  )}
                </div>
              )}

              {/* Direct Message Bubble */}
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-tr-xs bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 text-white shadow-lg overflow-hidden border border-purple-500/30">
                  <div className="p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {message}
                  </div>

                  {/* Interactive CTA button */}
                  {linkUrl && (
                    <div className="p-2 pt-0">
                      <div className="w-full py-2 px-3 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-center font-semibold text-white text-xs flex items-center justify-center gap-1.5 shadow-xs">
                        <span>{buttonLabel || "Open Link"}</span>
                        <ExternalLink className="w-3 h-3 text-white/90" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-neutral-500 text-right pr-1">
                Sent automatically ✓
              </p>
            </div>

            {/* Input mock */}
            <div className="p-2.5 border-t border-neutral-800 bg-neutral-900/90 flex items-center justify-between gap-2 shrink-0">
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                <Sparkles className="w-3 h-3" />
              </div>
              <div className="flex-1 bg-neutral-800/80 rounded-full px-3 py-1.5 text-[11px] text-neutral-400">
                Message…
              </div>
              <Heart className="w-4 h-4 text-neutral-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
