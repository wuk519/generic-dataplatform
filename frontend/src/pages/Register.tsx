import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { setToken } from "../lib/auth";
import { PulseIcon } from "../components/icons";
import { Spinner } from "../components/ui";

export default function Register() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { access_token } = await api.register(username, password);
      setToken(access_token);
      nav("/sources");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="flex items-center gap-2.5 relative">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <PulseIcon width={20} height={20} />
          </div>
          <span className="text-lg font-semibold">DataScope</span>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight">
            Create your account
          </h2>
          <p className="mt-3 text-slate-400 max-w-sm">
            Register to start uploading data sources and issuing API keys. You'll
            only see the data you own.
          </p>
        </div>
        <div className="relative text-sm text-slate-500">Local data platform</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <PulseIcon width={20} height={20} />
            </div>
            <span className="text-lg font-semibold text-slate-900">DataScope</span>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">
            Create account
          </h1>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Pick a username and password.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username
              </label>
              <input
                className="input"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-slate-400 mt-1">At least 6 characters.</p>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          <button disabled={loading} className="btn-primary w-full mt-5 py-2.5">
            {loading ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              "Create account"
            )}
          </button>

          <p className="text-sm text-slate-500 mt-4 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-violet-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
