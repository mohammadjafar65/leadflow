import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/App";
import { ApiError } from "@/lib/api-client";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg = err instanceof ApiError ? "Invalid email or password" : "Could not reach the server";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold text-primary mb-1">LeadFlow</h1>
        <p className="text-sm text-muted-foreground mb-6">Sign in to your workspace</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}