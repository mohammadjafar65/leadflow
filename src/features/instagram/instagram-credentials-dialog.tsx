import { useState } from "react";
import {
  X,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  Key,
  LogOut,
} from "lucide-react";
import type { IgAccount } from "@/api/instagram";
import { toast } from "sonner";

interface CredentialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: IgAccount[];
  loading: boolean;
  onConnect: () => void;
  onConnectToken: (token: string) => Promise<void>;
  onDisconnect: (id: string) => void;
}

export function InstagramCredentialsDialog({
  isOpen,
  onClose,
  accounts,
  loading,
  onConnect,
  onConnectToken,
  onDisconnect,
}: CredentialsDialogProps) {
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState(false);

  if (!isOpen) return null;

  const appId = (import.meta.env.VITE_META_APP_ID as string) || "1066399876105004";

  const handleCopyAppId = () => {
    void navigator.clipboard.writeText(appId);
    setCopiedAppId(true);
    toast.success("Meta App ID copied!");
    setTimeout(() => setCopiedAppId(false), 2000);
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenValue.trim()) return;
    setSavingToken(true);
    try {
      await onConnectToken(tokenValue.trim());
      setTokenValue("");
      setShowTokenInput(false);
    } catch {
      // Toast handled by parent
    } finally {
      setSavingToken(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Instagram & Meta Credentials
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Manage OAuth tokens, App ID, and connected profiles
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* App ID Pill */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-muted/40 border border-slate-200/80 dark:border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
                Meta App ID
              </span>
              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                {appId}
              </span>
            </div>
          </div>

          <button
            onClick={handleCopyAppId}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
          >
            {copiedAppId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copiedAppId ? "Copied" : "Copy ID"}</span>
          </button>
        </div>

        {/* Connected Profiles */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Connected Instagram Profile
          </h4>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-border text-center space-y-3">
              <Smartphone className="w-8 h-8 mx-auto text-purple-500 opacity-80" />
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                No Instagram Account Connected
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Authorize via Meta OAuth or provide a 60-day Instagram User Token.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={onConnect}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 text-white text-xs font-bold hover:opacity-95 transition-opacity"
                >
                  Connect via Meta OAuth
                </button>
                <button
                  onClick={() => setShowTokenInput((prev) => !prev)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-200 dark:border-border text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                >
                  Paste Token
                </button>
              </div>
            </div>
          ) : (
            accounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm">
                    {acc.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      @{acc.username}
                    </p>
                    <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.2 rounded border border-purple-200/50">
                      Professional / Creator
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onDisconnect(acc.id)}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Disconnect</span>
                </button>
              </div>
            ))
          )}

          {/* Token input form */}
          {showTokenInput && (
            <form onSubmit={handleTokenSubmit} className="p-3 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card space-y-2 mt-2">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                Paste User Access Token (starts with <code>IG...</code> or <code>EAA...</code>):
              </label>
              <textarea
                rows={2}
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="IGAA..."
                className="w-full text-xs font-mono rounded-lg border p-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTokenInput(false)}
                  className="px-3 py-1 rounded-lg border text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingToken}
                  className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {savingToken ? "Connecting..." : "Save Token"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
