import type { ContextContributor, ContextInput, ContextBlock } from "@neo-tavern/shared";

export class MemoryContributor implements ContextContributor {
  id = "memory";
  name = "Memory Contributor";

  async contribute(_input: ContextInput): Promise<ContextBlock[]> {
    return [];
  }
}
