import type { QueryClient } from '@tanstack/react-query';

export async function invalidateExpenseAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['report'] }),
    queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    queryClient.invalidateQueries({ queryKey: ['budget'] }),
  ]);
}

export async function invalidateRevenueAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['revenues'] }),
    queryClient.invalidateQueries({ queryKey: ['revenue-plan'] }),
  ]);
}

export async function invalidatePlanningAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['report'] }),
    queryClient.invalidateQueries({ queryKey: ['budget'] }),
    queryClient.invalidateQueries({ queryKey: ['revenue-plan'] }),
  ]);
}
