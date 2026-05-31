import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "../api/client";
import { useMe } from "../lib/useMe";
import { relativeTime } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Spinner,
} from "../components/ui";
import { UsersIcon } from "../components/icons";

export default function Users() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  const onError = (e: unknown) =>
    setActionError(e instanceof Error ? e.message : "Action failed");

  const create = useMutation({
    mutationFn: () => api.createUser(username, password, role),
    onSuccess: () => {
      setUsername("");
      setPassword("");
      setRole("user");
      setActionError(null);
      invalidate();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (args: {
      id: number;
      patch: { role?: "admin" | "user"; is_active?: boolean; password?: string };
    }) => api.updateUser(args.id, args.patch),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      setToDelete(null);
      setActionError(null);
      invalidate();
    },
    onError,
  });

  function resetPassword(u: User) {
    const pw = window.prompt(`New password for "${u.username}" (min 6 chars):`);
    if (pw) update.mutate({ id: u.id, patch: { password: pw } });
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage accounts. Admins see all data; users see only their own."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (username && password) create.mutate();
        }}
        className="card p-4 flex flex-wrap gap-2 mb-4"
      >
        <input
          className="input flex-1 min-w-[140px]"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="input flex-1 min-w-[140px]"
          type="password"
          placeholder="Password (min 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="input !w-auto"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "user")}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button
          className="btn-primary"
          disabled={!username || password.length < 6 || create.isPending}
        >
          Add user
        </button>
      </form>

      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 mb-4">
          {actionError}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Loading users…
        </div>
      )}
      {error && (
        <div className="card p-4 text-rose-600 text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="card overflow-hidden">
          {data.length === 0 ? (
            <EmptyState
              icon={<UsersIcon width={22} height={22} />}
              title="No users"
            />
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Username</th>
                  <th className="th">Role</th>
                  <th className="th">Status</th>
                  <th className="th">Created</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {data.map((u) => {
                  const isSelf = me?.id === u.id;
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="td font-medium">
                        {u.username}
                        {isSelf && (
                          <span className="ml-2 badge bg-violet-50 text-violet-700">
                            you
                          </span>
                        )}
                      </td>
                      <td className="td">
                        <select
                          className="input !py-1 !w-auto text-sm"
                          value={u.role}
                          disabled={isSelf || update.isPending}
                          onChange={(e) =>
                            update.mutate({
                              id: u.id,
                              patch: {
                                role: e.target.value as "admin" | "user",
                              },
                            })
                          }
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="td">
                        {u.is_active ? (
                          <span className="badge bg-emerald-50 text-emerald-700">
                            active
                          </span>
                        ) : (
                          <span className="badge bg-slate-100 text-slate-500">
                            disabled
                          </span>
                        )}
                      </td>
                      <td className="td text-slate-500 whitespace-nowrap">
                        {relativeTime(u.created_at)}
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        <button
                          className="text-sm text-slate-600 hover:underline mr-3"
                          onClick={() => resetPassword(u)}
                        >
                          Reset password
                        </button>
                        <button
                          className="text-sm text-slate-600 hover:underline mr-3 disabled:opacity-30"
                          disabled={isSelf || update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: u.id,
                              patch: { is_active: !u.is_active },
                            })
                          }
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          className="text-sm text-rose-600 hover:underline disabled:opacity-30"
                          disabled={isSelf}
                          onClick={() => setToDelete(u)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete user?"
        confirmLabel="Delete user"
        busy={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        message={
          toDelete && (
            <>
              Deleting{" "}
              <span className="font-medium">"{toDelete.username}"</span> also
              permanently removes all of their sources, events, and API keys.
              This cannot be undone.
            </>
          )
        }
      />
    </div>
  );
}
