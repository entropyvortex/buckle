import React from 'react';
import { Box, Text } from 'ink';

export function Logo(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        ╭───╮  buckle
      </Text>
      <Text color="gray" dimColor>
        ╰───╯  one verb for devcontainers
      </Text>
    </Box>
  );
}
