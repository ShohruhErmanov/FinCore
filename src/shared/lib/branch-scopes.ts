import type { Branch } from '@/shared/types/domain';

export function getActiveWritableBranches(
  branches: readonly Branch[],
  writeBranchScopes: readonly string[] = [],
): Branch[] {
  const writableIds = new Set(writeBranchScopes);
  return branches.filter((branch) => branch.isActive && writableIds.has(branch.id));
}
