import { Alert, Button, Card, Checkbox, Form, Input, Tag } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { Activity, Lock, Mic, UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { login } from '@/store/slices/authSlice';

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.auth);
  const location = useLocation() as { state?: { from?: string } };
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/dashboard'} replace />;
  return (
    <div className="auth-page">
      <Card className="auth-card" styles={{ body: { padding: 28 } }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
          <div className="app-sider-brand-mark"><Activity size={18} color="#fff" /></div>
          <div><div style={{ fontWeight: 700, fontSize: 18 }}>CareFlow PMS</div><div className="muted" style={{ fontSize: 12 }}>Voice-controlled practice management</div></div>
        </div>
        <Form layout="vertical" initialValues={{ username: 'mreed', password: 'demo', remember: true }} onFinish={(v) => dispatch(login({ username: v.username, password: v.password }))} requiredMark={false}>
          <Form.Item name="username" label="Username or email" rules={[{ required: true, message: 'Enter your username' }]}><Input prefix={<UserRound size={15} className="muted" />} autoComplete="username" size="large" /></Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}><Input.Password prefix={<Lock size={15} className="muted" />} autoComplete="current-password" size="large" /></Form.Item>
          <div className="flex justify-between items-center" style={{ marginBottom: 16 }}><Form.Item name="remember" valuePropName="checked" noStyle><Checkbox>Remember me</Checkbox></Form.Item><a>Forgot password?</a></div>
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" size="large" block loading={status === 'loading'}>Sign in</Button>
        </Form>
        <div style={{ marginTop: 20, padding: 12, background: 'var(--color-surface-muted)', borderRadius: 10, fontSize: 12.5 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}><Mic size={14} color="#0f6e8c" /><strong>Demo mode</strong></div>
          Any credentials work. Try <Tag style={{ margin: 0 }}>mreed</Tag> (Administrator) or <Tag style={{ margin: 0 }}>sahmed</Tag> (Physician). After signing in, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> to talk to the assistant.
        </div>
      </Card>
    </div>
  );
}
