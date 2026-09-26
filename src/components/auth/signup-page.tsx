import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/App";
import { ApiError } from "@/lib/api-client";

export function SignupPage() {
  const { signup } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signup(orgName, email, password);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 409
          ? "An account with this email already exists"
          : "Could not create your workspace";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-semibold text-primary mb-1">Create your workspace</h1>
        <p className="text-sm text-muted-foreground mb-6">You'll be the owner of the new organization</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium" htmlFor="org">Organization name</label>
            <input
              id="org"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="email">Work email</label>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-muted-foreground">At least 8 characters</p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create workspace"}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}