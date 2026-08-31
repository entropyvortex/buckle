/** Built-in templates that ship both Claude Code and Grok Build. */
export const DUAL_AGENT_TEMPLATES = ['ai-native', 'claude-corp'] as const;

export type DualAgentTemplate = (typeof DUAL_AGENT_TEMPLATES)[number];

export function isDualAgentTemplate(name: string): boolean {
  return (DUAL_AGENT_TEMPLATES as readonly string[]).includes(name);
}
