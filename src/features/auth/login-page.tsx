import { zodResolver } from '@hookform/resolvers/zod';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getApiErrorMessage } from '@/shared/api/client';
import { environment } from '@/shared/config/env';
import { landingRoute } from '@/shared/config/routes';
import { Alert, BrandMark, Button, FormField, Input, ThemeToggle } from '@/shared/ui';
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
    // Prefilled only in mock mode. Against a real backend these credentials do
    // not exist, and a pre-filled form that always fails is worse than an empty one.
    defaultValues: environment.enableMocks
      ? { login: '+998901112233', password: 'demo123' }
      : { login: '', password: '' },
  });
  if (auth.isAuthenticated) return <Navigate to={landingRoute(auth.hasPermission)} replace />;
  const requested = (location.state as { from?: string } | null)?.from ?? null;

  async function submit(values: LoginValues) {
    setServerError(null);
    try {
      // The landing depends on what the account may actually open, so it is
      // resolved from the signed-in user rather than assumed to be /dashboard.
      const signedIn = await auth.login(values);
      const fallback = landingRoute((code) => signedIn.permissions.includes(code));
      navigate(requested ?? fallback, { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  }

  return (
    <main className="login-page-shell">
      <div className="login-ambient login-ambient-one" aria-hidden="true" />
      <div className="login-ambient login-ambient-two" aria-hidden="true" />
      <ThemeToggle className="login-theme-toggle" />
      <section className="login-story-panel" aria-label="FINCORE haqida">
        <div className="login-brand-row">
          <div className="login-brand-mark">
            <BrandMark className="h-10 w-10" />
          </div>
          <div>
            <p className="login-brand-name">FINCORE</p>
            <p className="login-brand-caption">Moliya nazorati</p>
          </div>
          <span className="login-system-status">
            <span aria-hidden="true" /> Tizim faol
          </span>
        </div>

        <div className="login-story-content">
          <div className="login-story-copy">
            <p className="login-eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Financial operating system
            </p>
            <h1>
              Moliyani <span>aniq</span>, xavfsiz va real vaqtda boshqaring.
            </h1>
            <p>
              Budjet, tushum va xarajat yagona nazorat markazida. Har bir ko‘rsatkich manba
              tranzaksiyasigacha kuzatiladi.
            </p>
          </div>

          <div className="login-control-visual" aria-hidden="true">
            <div className="login-visual-ring login-visual-ring-outer" />
            <div className="login-visual-ring login-visual-ring-inner" />
            <div className="login-visual-core">
              <Activity size={28} />
              <strong>LIVE</strong>
            </div>
            <div className="login-visual-orbit">
              <div className="login-visual-node login-visual-node-plan">
                <span>REJA</span>
                <i />
              </div>
              <div className="login-visual-node login-visual-node-fact">
                <span>FAKT</span>
                <i />
              </div>
              <div className="login-visual-node login-visual-node-audit">
                <span>AUDIT</span>
                <i />
              </div>
            </div>
          </div>
        </div>

        <div className="login-feature-row">
          <div className="login-feature-card">
            <span className="login-feature-icon login-feature-icon-success">
              <ShieldCheck size={18} />
            </span>
            <span>
              <strong>Scope nazorati</strong>
              <small>Role va filial kesimida</small>
            </span>
          </div>
          <div className="login-feature-card">
            <span className="login-feature-icon">
              <BarChart3 size={18} />
            </span>
            <span>
              <strong>Jonli analitika</strong>
              <small>Reja va fakt bir ekranda</small>
            </span>
          </div>
          <div className="login-feature-card">
            <span className="login-feature-icon login-feature-icon-warning">
              <LockKeyhole size={18} />
            </span>
            <span>
              <strong>Audit izi</strong>
              <small>Har bir amal kuzatuvda</small>
            </span>
          </div>
        </div>
      </section>

      <section className="login-access-panel">
        <div className="login-access-stack">
          <div className="login-mobile-brand">
            <div className="login-brand-mark login-brand-mark-mobile">
              <BrandMark className="h-9 w-9" />
            </div>
            <div>
              <p className="login-brand-name">FINCORE</p>
              <p className="login-brand-caption">Moliya nazorati</p>
            </div>
          </div>

          <div className="login-form-card">
            <div className="login-form-heading">
              <div className="login-auth-emblem" aria-hidden="true">
                <Fingerprint size={25} />
              </div>
              <div>
                <p className="login-form-kicker">Xavfsiz kirish</p>
                <h2>Tizimga kirish</h2>
              </div>
              <span className="login-secure-pill">
                <ShieldCheck size={13} /> Himoyalangan
              </span>
            </div>
            <p className="login-form-description">
              FinCore boshqaruv paneliga kirish uchun hisob ma’lumotlaringizni kiriting.
            </p>
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
                <div className="login-field-shell">
                  <span className="login-input-icon" aria-hidden="true">
                    <Phone size={16} />
                  </span>
                  <Input
                    id="login"
                    autoComplete="username"
                    className="login-input pl-12"
                    placeholder="+998 00 000 00 00"
                    aria-invalid={Boolean(errors.login)}
                    aria-describedby={errors.login ? 'login-error' : undefined}
                    {...register('login')}
                  />
                </div>
              </FormField>
              <FormField label="Parol" htmlFor="password" required error={errors.password?.message}>
                <div className="login-field-shell">
                  <span className="login-input-icon" aria-hidden="true">
                    <LockKeyhole size={16} />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="login-input px-12"
                    placeholder="Parolingizni kiriting"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
              <Button
                type="submit"
                size="lg"
                className="login-submit w-full"
                loading={isSubmitting}
              >
                <span>Kirish</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </form>
            {environment.enableMocks && (
              <div className="login-demo-panel">
                <div className="login-demo-heading">
                  <span>Demo hisoblar</span>
                  <small>Parol: demo123</small>
                </div>
                <div className="login-demo-actions">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.phone}
                      type="button"
                      onClick={() => {
                        setValue('login', account.phone);
                        setValue('password', 'demo123');
                      }}
                      className="login-demo-button"
                    >
                      {account.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="login-session-note">
            <LockKeyhole size={13} aria-hidden="true" />
            {environment.enableMocks
              ? 'Demo muhit. Production sessiya HTTP-only cookie orqali boshqariladi.'
              : 'Sessiya HTTP-only cookie orqali boshqariladi.'}
          </p>
        </div>
      </section>
    </main>
  );
}
