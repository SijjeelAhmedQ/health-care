import { Alert, Button, Card, Checkbox, Form, Input } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { Activity, Lock, LogIn, Mic, UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { login } from '@/store/slices/authSlice';
import { authService } from '@/services/api';

/** A handful of the provider accounts, to fill the form with one click. */
const demoAccounts = authService.providerAccounts().slice(0, 4);

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const location = useLocation() as { state?: { from?: string } };
  const [form] = Form.useForm();

  // Signing in lands on the provider's own dashboard (or where they were sent from).
  if (status === 'authenticated') {
    return <Navigate to={location.state?.from ?? '/dashboard'} replace />;
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-brand">
          <div className="app-sider-brand-mark"><Activity size={20} color="#fff" /></div>
          <div>
            <div className="auth-brand-title">CareFlow PMS</div>
            <div className="auth-brand-sub">Voice-controlled practice management</div>
          </div>
        </div>

        <h1 className="auth-title">Sign in</h1>
        <p className="auth-subtitle">Sign in with your provider account.</p>

        {error && <Alert type="error" message={error} description="Check your username and password, then try again." showIcon style={{ marginBottom: 16 }} />}

        <Form
          form={form}
          layout="vertical"
          initialValues={{ username: demoAccounts[0]?.username ?? '', password: 'demo', remember: true }}
          onFinish={(v) => dispatch(login({ username: v.username, password: v.password }))}
          requiredMark={false}
        >
          <Form.Item name="username" label="Username or email" rules={[{ required: true, message: 'Enter your username to continue' }]}>
            <Input prefix={<UserRound size={15} className="muted" />} autoComplete="username" size="large" placeholder={`e.g. ${demoAccounts[0]?.username ?? 'username'}`} />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password to continue' }]}>
            <Input.Password prefix={<Lock size={15} className="muted" />} autoComplete="current-password" size="large" placeholder="Your password" />
          </Form.Item>
          <div className="flex justify-between items-center" style={{ marginBottom: 18 }}>
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>Keep me signed in</Checkbox>
            </Form.Item>
            <a href="#reset" onClick={(e) => e.preventDefault()}>Forgot password?</a>
          </div>
          <Button type="primary" htmlType="submit" size="large" block icon={<LogIn size={16} />} loading={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </Button>
        </Form>

        <div className="auth-demo">
          <div className="auth-demo-head">
            <Mic size={15} color="var(--color-primary)" />
            <strong>Demo mode</strong>
          </div>
          Any password works. Pick an account to fill the form, then press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> once inside to talk to the assistant.
          <div className="auth-demo-accounts">
            {demoAccounts.map((a) => (
              <button key={a.username} type="button" onClick={() => form.setFieldsValue({ username: a.username, password: 'demo' })}>
                {a.username} · {a.fullName}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
