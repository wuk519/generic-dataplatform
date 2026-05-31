import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/** Current logged-in user (id, username, role). Cached for the session. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: 5 * 60 * 1000,
  });
}
