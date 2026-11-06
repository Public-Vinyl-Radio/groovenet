import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

describe("page h1 lint guard (#994)", () => {
  it("rejects a raw Heading h1 in product code", async () => {
    const [result] = await eslint.lintText(
      'import { Heading } from "@chakra-ui/react"; export function Page() { return <Heading as="h1">Albums</Heading>; }',
      { filePath: "src/app/__heading_guard_fixture__.tsx" },
    );

    expect(result.messages.map(({ message }) => message)).toContain(
      'Use PageHeader.Title as the page\'s one h1; raw Chakra Heading as="h1" is reserved for PageHeader parts (#994).',
    );
  });

  it("allows the Heading h1 in PageHeader parts", async () => {
    const [result] = await eslint.lintFiles(["src/components/layout/PageHeader/parts.tsx"]);

    expect(result.messages.map(({ message }) => message)).not.toContain(
      'Use PageHeader.Title as the page\'s one h1; raw Chakra Heading as="h1" is reserved for PageHeader parts (#994).',
    );
  });
});
