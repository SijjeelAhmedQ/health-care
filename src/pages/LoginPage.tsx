import { Alert, Button, Card, Form, Input, Radio } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { Activity, CalendarHeart, Inbox, Lock, LogIn, Mic, Sparkles, UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { login } from '@/store/slices/authSlice';
import { authService } from '@/services/api';
import { Avatar } from '@/components/common';

/** A handful of the provider accounts, to fill the form with one click. */
const demoAccounts = authService.providerAccounts().slice(0, 4);

const features = [
  { icon: <Mic size={17} />, title: 'Talk to your chart', text: 'Ask for anything in your own words — the assistant does the clicking.' },
  { icon: <CalendarHeart size={17} />, title: 'Your day at a glance', text: 'Schedule, tasks, recalls and what needs you, on one screen.' },
  { icon: <Inbox size={17} />, title: 'A calmer Inbox', text: 'Results and letters sorted by urgency, filed in a keystroke.' },
];

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const location = useLocation() as { state?: { from?: string } };
  const [form] = Form.useForm();
  const username = Form.useWatch('username', form);

  // Signing in lands on the provider's own dashboard (or where they were sent from).
  if (status === 'authenticated') {
    return <Navigate to={location.state?.from ?? '/dashboard'} replace />;
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside" aria-hidden>
        <div className="auth-aside-brand">
          <div className="app-sider-brand-mark">
            <Activity size={20} color="#fff" strokeWidth={2.4} />
          </div>
          CareFlow
        </div>
        <div>
          <h2>Practice management that listens.</h2>
          <p>A voice-first workspace for providers — patients, records and the Inbox, all one sentence away.</p>
        </div>
        <div className="auth-features">
          {features.map((f) => (
            <div key={f.title} className="auth-feature">
              <span className="auth-feature-icon">{f.icon}</span>
              <div>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="auth-main">
        <Card className="auth-card">
          <div className="auth-brand">
            <div className="app-sider-brand-mark">
              <Activity size={20} color="#fff" strokeWidth={2.4} />
            </div>
            <div>
              <div className="auth-brand-title">CareFlow PMS</div>
              <div className="auth-brand-sub">Voice-controlled practice management</div>
            </div>
          </div>

          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Welcome back — sign in with your provider account.</p>

          {error && <Alert type="error" message={error} description="Check your username and password, then try again." showIcon style={{ marginBottom: 16 }} />}

          <Form
            form={form}
            layout="vertical"
            initialValues={{ username: demoAccounts[0]?.username ?? '', password: 'demo', remember: true }}
            onFinish={(v) => dispatch(login({ username: v.username, password: v.password }))}
            requiredMark={false}
          >
            <Form.Item name="username" label="Username or email" rules={[{ required: true, message: 'Enter your username to continue' }]}>
              <Input prefix={<UserRound size={16} className="muted" />} autoComplete="username" size="large" placeholder={`e.g. ${demoAccounts[0]?.username ?? 'username'}`} />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password to continue' }]}>
              <Input.Password prefix={<Lock size={16} className="muted" />} autoComplete="current-password" size="large" placeholder="Your password" />
            </Form.Item>
            <div className="auth-remember">
              <div className="auth-remember-row">
                <span className="auth-remember-label">On this device</span>
                <a href="#reset" onClick={(e) => e.preventDefault()}>
                  Forgot password?
                </a>
              </div>
              <Form.Item name="remember" noStyle>
                <Radio.Group
                  className="choice-bar is-block"
                  optionType="button"
                  aria-label="Stay signed in on this device"
                  options={[
                    { value: true, label: 'Keep me signed in' },
                    { value: false, label: 'Just this session' },
                  ]}
                />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" size="large" block icon={<LogIn size={17} />} loading={status === 'loading'}>
              {status === 'loading' ? 'Signing in…' : 'Sign in'}
            </Button>
          </Form>

          <div className="auth-demo">
            <div className="auth-demo-head">
              <Sparkles size={15} color="var(--color-accent)" />
              <strong>Demo mode</strong>
            </div>
            Any password works. Pick an account to fill the form, then press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> once inside to talk to the assistant.
            <div className="auth-demo-accounts">
              {demoAccounts.map((a) => (
                <button key={a.username} type="button" aria-pressed={username === a.username} onClick={() => form.setFieldsValue({ username: a.username, password: 'demo' })}>
                  <Avatar name={a.fullName} size={30} />
                  <span>
                    <b>{a.fullName}</b>
                    <small>{a.username}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
