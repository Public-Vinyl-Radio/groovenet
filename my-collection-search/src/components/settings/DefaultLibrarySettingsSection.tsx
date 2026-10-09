"use client";

import React from "react";
import { Box, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import UsernameSelect from "@/components/UsernameSelect";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useUsername } from "@/providers/UsernameProvider";

export default function DefaultLibrarySettingsSection(): React.JSX.Element {
  const { friend, setFriend, isSaving } = useUsername();
  const { friends, friendsLoading } = useFriendsQuery({
    showCurrentUser: true,
  });

  return (
    <Box>
      <Heading size="lg" mb={2}>
        Default Library
      </Heading>
      <Text color="fg.muted" mb={4}>
        Choose the library used by tracks, albums, and spins across sessions.
      </Text>

      <Flex gap={3} align="center" flexWrap="wrap">
        <Box minW="240px">
          <UsernameSelect
            usernames={friends}
            includeAllOption={false}
            onChange={(friendId) => {
              const selected = friends.find((item) => item.id === friendId) ?? null;
              setFriend(selected);
            }}
            value={friend ?? null}
            isLoading={friendsLoading}
            size="md"
          />
        </Box>
        {isSaving ? <Spinner size="sm" /> : null}
        <Text fontSize="sm" color="fg.muted">
          This library becomes the default everywhere except playlists.
        </Text>
      </Flex>
    </Box>
  );
}
