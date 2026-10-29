import { Box, Text } from "@chakra-ui/react";
import { useState as useLocalState } from "react";
import ReactMarkdown from "react-markdown";
// ExpandableMarkdown component for markdown notes with expand/collapse
interface ExpandableMarkdownProps {
  text: string;
  maxLength?: number;
}

export default function ExpandableMarkdown({ text, maxLength = 100 }: ExpandableMarkdownProps) {
  const [expanded, setExpanded] = useLocalState(false);
  const isLong = text.length > maxLength;
  const displayText = !expanded && isLong ? text.slice(0, maxLength) + "..." : text;
  return (
    <Box>
      <Box fontSize={["xs", "sm", "sm"]}>
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <Text as="span" lineHeight="short" m={0}>
                {children}
              </Text>
            ),
          }}
        >
          {displayText}
        </ReactMarkdown>
        {isLong && (
          <Text
            as="span"
            color="accent.fg"
            fontSize="xs"
            cursor="pointer"
            textDecoration="underline"
            onClick={() => setExpanded((e) => !e)}
            _hover={{ color: "accent.fg" }}
            role="button"
            tabIndex={0}
            display="inline"
            ml={1}
          >
            {expanded ? "show less" : "more"}
          </Text>
        )}
      </Box>
    </Box>
  );
}
