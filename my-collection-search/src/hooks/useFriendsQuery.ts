import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

import { addFriendApi, fetchFriends, removeFriendApi } from "@/services/internalApi/friends";

export function useFriendsQuery({
  showCurrentUser = false,
}: {
  showCurrentUser?: boolean;
} = {}) {
  const qc = useQueryClient();

  const { data: friends = [], isLoading } = useQuery({
    queryKey: queryKeys.friends(),
    queryFn: () => fetchFriends(!!showCurrentUser),
  });

  const addFriend = useMutation({
    mutationFn: (username: string) => addFriendApi(username),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends() }),
  });

  const removeFriend = useMutation({
    mutationFn: (username: string) => removeFriendApi(username),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.friends() }),
  });

  return {
    friends,
    friendsLoading: isLoading,
    addFriend: (u: string) => addFriend.mutateAsync(u),
    removeFriend: (u: string) => removeFriend.mutateAsync(u),
    addFriendPending: addFriend.isPending,
    removeFriendPending: removeFriend.isPending,
  };
}
