import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useMe } from "../lib/useMe";
import { Avatar, PageHeader, Spinner } from "../components/ui";

export default function Profile() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Seed the form once the profile loads.
  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name ?? "");
      setEmail(me.email ?? "");
    }
  }, [me]);

  const refreshMe = () => qc.invalidateQueries({ queryKey: ["me"] });

  const saveProfile = useMutation({
    mutationFn: () =>
      api.updateProfile({
        display_name: displayName.trim() || null,
        email: email.trim() || null,
      }),
    onSuccess: () => {
      setProfileMsg("Saved.");
      refreshMe();
    },
    onError: (e) =>
      setProfileMsg(e instanceof Error ? e.message : "Could not save"),
  });

  const avatar = useMutation({
    mutationFn: (file: File) => api.uploadAvatar(file),
    onSuccess: refreshMe,
  });
  const removeAvatar = useMutation({
    mutationFn: () => api.deleteAvatar(),
    onSuccess: refreshMe,
  });

  const changePw = useMutation({
    mutationFn: () => api.changePassword(currentPw, newPw),
    onSuccess: () => {
      setPwMsg({ ok: true, text: "Password changed." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    },
    onError: (e) =>
      setPwMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Could not change password",
      }),
  });

  if (!me) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner /> Loading profile…
      </div>
    );
  }

  const displayLabel = me.display_name || me.username;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" subtitle="Manage your account details." />

      {/* Identity card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4">
          <Avatar name={displayLabel} src={me.avatar} size={72} />
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900">
              {displayLabel}
            </div>
            <div className="text-sm text-slate-500">
              @{me.username} · <span className="capitalize">{me.role}</span>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-outline !py-1 !text-sm"
                onClick={() => fileRef.current?.click()}
                disabled={avatar.isPending}
              >
                {avatar.isPending ? "Uploading…" : "Change picture"}
              </button>
              {me.avatar && (
                <button
                  className="btn-ghost !py-1 !text-sm text-rose-600"
                  onClick={() => removeAvatar.mutate()}
                  disabled={removeAvatar.isPending}
                >
                  Remove
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) avatar.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>
            {avatar.error && (
              <div className="text-xs text-rose-600 mt-1">
                {(avatar.error as Error).message}
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">
              PNG or JPG, up to 512 KB.
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Details</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Display name
            </label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={me.username}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              setProfileMsg(null);
              saveProfile.mutate();
            }}
            disabled={saveProfile.isPending}
          >
            {saveProfile.isPending ? "Saving…" : "Save changes"}
          </button>
          {profileMsg && (
            <span className="text-sm text-slate-500">{profileMsg}</span>
          )}
        </div>
      </div>

      {/* Password */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Change password
        </h2>
        <div className="space-y-3">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="New password (min 6)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={
              changePw.isPending ||
              !currentPw ||
              newPw.length < 6 ||
              newPw !== confirmPw
            }
            onClick={() => {
              setPwMsg(null);
              changePw.mutate();
            }}
          >
            {changePw.isPending ? "Updating…" : "Update password"}
          </button>
          {newPw && confirmPw && newPw !== confirmPw && (
            <span className="text-sm text-rose-600">Passwords don't match.</span>
          )}
          {pwMsg && (
            <span
              className={`text-sm ${
                pwMsg.ok ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {pwMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
