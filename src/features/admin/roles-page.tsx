import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type { PermissionCode, RoleCode } from '@/shared/types/domain';
import { Alert, Button, Card, PageHeader } from '@/shared/ui';

const permissionGroups: Array<{
  label: string;
  items: Array<{ code: PermissionCode; label: string }>;
}> = [
  { label: 'Asosiy', items: [{ code: 'dashboard.view', label: 'Dashboardni ko‘rish' }] },
  {
    label: 'Xarajat',
    items: [
      { code: 'expense.view_own_branch', label: 'O‘z filialini ko‘rish' },
      { code: 'expense.view_all_branches', label: 'Barcha filiallarni ko‘rish' },
      { code: 'expense.create', label: 'Xarajat yaratish' },
      { code: 'expense.edit', label: 'Xarajat tahrirlash' },
    ],
  },
  {
    label: 'Tushum',
    items: [
      { code: 'revenue.view_own_branch', label: 'O‘z filiali tushumini ko‘rish' },
      { code: 'revenue.view_all_branches', label: 'Barcha filiallar tushumini ko‘rish' },
      { code: 'revenue.create', label: 'Kunlik tushum kiritish' },
      { code: 'revenue.edit', label: 'Kunlik tushumni tahrirlash' },
    ],
  },
  {
    label: 'Rejalashtirish',
    items: [
      { code: 'budget.view', label: 'Budjetni ko‘rish' },
      { code: 'budget.create_edit', label: 'Budjet yaratish/tahrirlash' },
      { code: 'revenue_plan.manage', label: 'Tushum rejasini boshqarish' },
    ],
  },
  {
    label: 'Nazorat',
    items: [
      { code: 'import.run', label: 'Excel’dan import qilish' },
      { code: 'notification.manage', label: 'Telegram bildirishnoma sozlamalari' },
      { code: 'audit.view', label: 'Audit jurnalini ko‘rish' },
    ],
  },
  {
    label: 'Hisobotlar',
    items: [
      { code: 'reports.view', label: 'Hisobotlarni ko‘rish' },
      { code: 'reports.view_cashiers', label: 'Kassirlar hisoboti (oylik bilan)' },
      { code: 'reports.view_own_performance', label: 'O‘z natijasini ko‘rish' },
    ],
  },
  {
    label: 'Boshqaruv',
    items: [
      { code: 'master_data.manage', label: 'Master-data' },
      { code: 'user.manage', label: 'Userlar' },
      { code: 'user.deactivate', label: 'Userni nofaol qilish' },
      { code: 'user.delete', label: 'Userni butunlay o‘chirish' },
      { code: 'role.manage', label: 'Rollar' },
    ],
  },
  {
    label: 'Investor',
    items: [
      { code: 'investor.view_own', label: 'O‘z ulushini ko‘rish' },
      { code: 'investor.view_all', label: 'Barcha investorlarni ko‘rish' },
      { code: 'investor.manage', label: 'Investor va to‘lovlarini boshqarish' },
      { code: 'investor.settlement.request', label: 'To‘lov so‘rovi yuborish' },
      { code: 'investor.settlement.approve', label: 'So‘rovni tasdiqlash / rad etish' },
      { code: 'investor.settlement.pay', label: 'Tasdiqlangan so‘rovni to‘lash' },
    ],
  },
];

const initialRolePermissions: Record<RoleCode, PermissionCode[]> = {
  cashier: [
    'dashboard.view',
    'expense.view_own_branch',
    'expense.create',
    'revenue.view_own_branch',
    'revenue.create',
    'reports.view',
    'reports.view_own_performance',
  ],
  finance_manager: [
    'dashboard.view',
    'expense.view_own_branch',
    'expense.view_all_branches',
    'expense.create',
    'expense.edit',
    'budget.view',
    'budget.create_edit',
    'revenue.view_own_branch',
    'revenue.view_all_branches',
    'revenue.create',
    'revenue.edit',
    'revenue_plan.manage',
    'import.run',
    'notification.manage',
    'reports.view',
    'reports.view_cashiers',
    'reports.view_own_performance',
    'master_data.manage',
  ],
  // Direktor — nazorat va rejalashtirish roli: kunlik xarajat/tushum kiritmaydi.
  director: [
    'dashboard.view',
    'expense.view_own_branch',
    'expense.view_all_branches',
    'budget.view',
    'budget.create_edit',
    'revenue.view_own_branch',
    'revenue.view_all_branches',
    'revenue_plan.manage',
    'import.run',
    'notification.manage',
    'reports.view',
    'reports.view_cashiers',
    'master_data.manage',
    'user.manage',
    'user.deactivate',
    'user.delete',
    'role.manage',
    'investor.view_all',
    'investor.manage',
    'investor.settlement.approve',
    'investor.settlement.pay',
  ],
  // Deliberately minimal: an investor reads their own settlement and receives
  // no expense, revenue, budget, user or role permission.
  investor: ['investor.view_own', 'investor.settlement.request'],
  business_owner: [
    'dashboard.view',
    'expense.view_own_branch',
    'expense.view_all_branches',
    'budget.view',
    'revenue.view_own_branch',
    'revenue.view_all_branches',
    'reports.view',
    'investor.view_all',
    'audit.view',
  ],
};

const roleNames: Record<RoleCode, string> = {
  cashier: 'Kassir',
  finance_manager: 'Moliya rahbari',
  director: 'Direktor',
  investor: 'Investor',
  business_owner: 'Biznes egasi',
};

export function RolesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission('role.manage');
  const [selectedRole, setSelectedRole] = useState<RoleCode>('cashier');
  const [matrix, setMatrix] = useState(initialRolePermissions);
  const roles = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: ({ signal }) => adminApi.rolePermissions(signal),
  });
  useEffect(() => {
    if (roles.data) setMatrix(roles.data);
  }, [roles.data]);

  // The server is the authority on which roles exist. roleNames is only a
  // label lookup, so the tabs are driven by the matrix the backend returned —
  // a role present in one and absent from the other must never crash the page.
  const roleList = (Object.keys(matrix) as RoleCode[]).filter((role) => matrix[role]);

  useEffect(() => {
    if (roleList.length > 0 && !matrix[selectedRole]) setSelectedRole(roleList[0]!);
  }, [roleList, matrix, selectedRole]);

  const selectedPermissions = matrix[selectedRole] ?? [];
  const canEditSelected = canManage && selectedRole !== 'business_owner';

  const save = useMutation({
    mutationFn: () => adminApi.updateRolePermissions(selectedRole, selectedPermissions),
    onSuccess: async (saved) => {
      setMatrix((current) => ({ ...current, [saved.role]: saved.permissions }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roles', 'permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.userDirectory }),
      ]);
    },
  });
  const toggle = (permission: PermissionCode) =>
    setMatrix((current) => {
      const held = current[selectedRole] ?? [];
      return {
        ...current,
        [selectedRole]: held.includes(permission)
          ? held.filter((item) => item !== permission)
          : [...held, permission],
      };
    });
  return (
    <>
      <PageHeader
        title="Rollar va permissionlar"
        description="Role katalogi UI navigatsiya uchun capability beradi; haqiqiy authorization har endpointda backend tomonidan tekshiriladi."
        actions={
          canEditSelected ? (
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              <Save className="h-4 w-4" />
              O‘zgarishlarni saqlash
            </Button>
          ) : undefined
        }
      />
      <Alert title="Multi-role qo‘llab-quvvatlanadi" tone="info" className="mb-5">
        Moliya rahbari global rol bilan birga Sayxun kassiri filial scope’iga ega bo‘lishi mumkin.
        Maxsus “finance_manager_cashier” roli yaratilmaydi.
      </Alert>
      {save.isSuccess ? (
        <Alert title="Permission matriksi saqlandi" tone="success" className="mb-5">
          Server qaytargan effective permissionlar keyingi `/me` yangilanishida qo‘llanadi.
        </Alert>
      ) : null}
      {selectedRole === 'business_owner' ? (
        <Alert title="Biznes egasi — himoyalangan read-only rol" tone="info" className="mb-5">
          Bu rolning strategik ko‘rish ruxsatlari oddiy permission matriksi orqali o‘zgartirilmaydi.
        </Alert>
      ) : null}
      {save.isError ? (
        <Alert title="Permissionlarni saqlab bo‘lmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(save.error)}
        </Alert>
      ) : null}
      {roles.isError ? (
        <Alert title="Permission matriksini yuklab bo‘lmadi" tone="danger" className="mb-5">
          {getApiErrorMessage(roles.error)}
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card title="Rollar">
          <div role="tablist" aria-label="Rollar" className="space-y-2">
            {roleList.map((role) => (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={selectedRole === role}
                onClick={() => setSelectedRole(role)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold ${selectedRole === role ? 'bg-blue-50 text-primary' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {roleNames[role] ?? role}
                </span>
                <span className="tabular-nums text-xs">{matrix[role]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card
          title={`${roleNames[selectedRole] ?? selectedRole} permissionlari`}
          description="Rang emas, checkbox va aniq matn permission holatini bildiradi."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            {permissionGroups.map((group) => (
              <fieldset key={group.label}>
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  {group.label}
                </legend>
                <div className="space-y-2">
                  {group.items.map((permission) => (
                    <label
                      key={permission.code}
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        checked={selectedPermissions.includes(permission.code)}
                        disabled={
                          !canEditSelected ||
                          ((permission.code === 'user.deactivate' ||
                            permission.code === 'user.delete') &&
                            selectedRole !== 'director')
                        }
                        onChange={() => toggle(permission.code)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-ink">
                          {permission.label}
                        </span>
                        <code className="text-[11px] text-muted">{permission.code}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
