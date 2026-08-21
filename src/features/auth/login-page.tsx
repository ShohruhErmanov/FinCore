import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Landmark, LockKeyhole, Phone, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getApiErrorMessage } from '@/shared/api/client';
import { routes } from '@/shared/config/routes';
import { Alert, Button, FormField, Input } from '@/shared/ui';
import { useAuth } from './auth-context';

const schema = z.object({
  login: z.string().min(7, 'Telefon raqamni kiriting.'),
  password: z.string().min(6, 'Parol kamida 6 belgidan iborat.'),
});
type LoginValues = z.infer<typeof schema>;

const demoAccounts = [
  { label: 'Direktor', phone: '+998901112233' },
  { label: 'Moliya + kassir', phone: '+998907778899' },
  { label: 'Xalqlar kassiri', phone: '+998909991122' },
];

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { login: '+998901112233', password: 'demo123' },
  });
  if (auth.isAuthenticated) return <Navigate to={routes.dashboard} replace />;
  const destination = (location.state as { from?: string } | null)?.from ?? routes.dashboard;

  async function submit(values: LoginValues) {
    setServerError(null);
    try {
      await auth.login(values);
      navigate(destination, { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  }

  return (
    <main className="min-h-screen bg-navy lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        aria-label="FINCORE haqida"
      >
        <div className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -right-32 -top-24 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-white shadow-lg">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">FINCORE</p>
            <p className="text-xs text-slate-300">O‘quv markazi moliyasi</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            Aniq. Nazoratli. Shaffof.
          </p>
          <h1 className="mt-5 text-5xl font-bold leading-tight tracking-tight">
            Ikki filial moliyasini bitta ishonchli ledgerda boshqaring.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
            Budjet, xarajat, tushum, kassir va reconciliation bir-biriga bog‘langan. Har KPI manba
            tranzaksiyasigacha ochiladi.
          </p>
        </div>
        <div className="relative flex gap-8 text-sm text-slate-300">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-400" />
            Role va filial scope
          </span>
          <span className="inline-flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-blue-300" />
            Audit qilinadigan oqim
          </span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-ink">FINCORE</p>
              <p className="text-xs text-muted">Moliya platformasi</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-ink">Tizimga kirish</h2>
            <p className="mt-2 text-sm text-muted">Telefon raqamingiz va parolingizni kiriting.</p>
            {serverError ? (
              <Alert title="Kirish amalga oshmadi" tone="danger" className="mt-5">
                {serverError}
              </Alert>
            ) : null}
            <form className="mt-6 space-y-5" onSubmit={handleSubmit(submit)} noValidate>
              <FormField
                label="Telefon raqam"
                htmlFor="login"
                required
                error={errors.login?.message}
              >
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="login"
                    autoComplete="username"
                    className="pl-10"
                    aria-invalid={Boolean(errors.login)}
                    aria-describedby={errors.login ? 'login-error' : undefined}
                    {...register('login')}
                  />
                </div>
              </FormField>
              <FormField label="Parol" htmlFor="password" required error={errors.password?.message}>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="px-10"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1.5 grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-100"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                Kirish
              </Button>
            </form>
            <div className="mt-7 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Demo hisoblar · parol: demo123
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.phone}
                    type="button"
                    onClick={() => {
                      setValue('login', account.phone);
                      setValue('password', 'demo123');
                    }}
                    className="rounded-full border border-border bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-slate-400">
            Demo muhit. Production sessiya HTTP-only cookie orqali boshqariladi.
          </p>
        </div>
      </section>
    </main>
  );
}
