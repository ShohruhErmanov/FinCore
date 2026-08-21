import type { QueryClient } from '@tanstack/react-query';

export async function invalidateRevenueAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['report'] }),
    queryClient.invalidateQueries({ queryKey: ['revenue-transactions'] }),
  ]);
}

export async function invalidateExpenseAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['report'] }),
    queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  ]);
}

export async function invalidatePlanningAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['report'] }),
    queryClient.invalidateQueries({ queryKey: ['revenue-plan-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['period-readiness'] }),
  ]);
}
