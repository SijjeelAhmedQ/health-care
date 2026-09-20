import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Radio, Row, Select, Switch, Tag, TimePicker, message } from 'antd';
import { Bell, ClipboardList, Pill, Save, Settings, Shield, SlidersHorizontal, Stethoscope, CalendarCog, RotateCcw } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/common';
import { useLocalStorage } from '@/hooks';
import { aiConfig, effectiveConfig } from '@/services/ai/config';
import { PageRegistry } from '@/registry/pageRegistry';
import { FieldRegistry, ROLE_OPTIONS, LOCATION_OPTIONS } from '@/registry/fieldRegistry';

type SettingType = 'text' | 'number' | 'select' | 'multiselect' | 'switch' | 'radio' | 'time' | 'textarea' | 'password';
interface Setting { name: string; label: string; type: SettingType; options?: string[]; help?: string; span?: 1 | 2; min?: number; max?: number; suffix?: string }
interface Section { title: string; description?: string; settings: Setting[] }

function renderControl(s: Setting) {
  switch (s.type) {
    case 'number': return <InputNumber min={s.min} max={s.max} style={{ width: '100%' }} addonAfter={s.suffix} />;
    case 'select': return <Select options={s.options?.map((o) => ({ value: o, label: o }))} />;
    case 'multiselect': return <Select mode="multiple" options={s.options?.map((o) => ({ value: o, label: o }))} />;
    case 'switch': return <Switch />;
    case 'radio': return <Radio.Group optionType="button" buttonStyle="solid" options={s.options?.map((o) => ({ value: o, label: o }))} />;
    case 'time': return <TimePicker.RangePicker format="h:mm A" use12Hours style={{ width: '100%' }} />;
    case 'textarea': return <Input.TextArea rows={3} />;
    case 'password': return <Input.Password />;
    default: return <Input addonAfter={s.suffix} />;
  }
}

/** Generic, schema-driven configuration page — every config screen shares the same UX. */
function ConfigPage({ storageKey, title, subtitle, sections, defaults, icon, sidebar }: { storageKey: string; title: string; subtitle: string; sections: Section[]; defaults: Record<string, unknown>; icon: ReactNode; sidebar?: ReactNode }) {
  const [saved, setSaved] = useLocalStorage<Record<string, unknown>>(`careflow.config.${storageKey}`, defaults);
  const [form] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  const count = sections.reduce((n, s) => n + s.settings.length, 0);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={<><Button icon={<RotateCcw size={15} />} onClick={() => { form.setFieldsValue(defaults); setDirty(true); }}>Restore defaults</Button><Button type="primary" icon={<Save size={15} />} onClick={() => form.submit()} disabled={!dirty}>Save Changes</Button></>} />
      <Row gutter={20}>
        <Col xs={24} lg={sidebar ? 16 : 24}>
          <Form form={form} layout="vertical" initialValues={saved} onValuesChange={() => setDirty(true)} onFinish={(v) => { setSaved({ ...saved, ...v }); setDirty(false); message.success(`${title} saved`); }}>
            {sections.map((sec) => (
              <SectionCard key={sec.title} title={<span className="flex items-center gap-2">{icon}{sec.title}</span>} extra={sec.description && <span className="muted" style={{ fontSize: 12 }}>{sec.description}</span>}>
                <div className="form-grid cols-2">
                  {sec.settings.map((s) => (
                    <Form.Item key={s.name} name={s.name} label={s.label} help={s.help} valuePropName={s.type === 'switch' ? 'checked' : 'value'} className={s.span === 2 ? 'span-2' : undefined}>
                      {renderControl(s)}
                    </Form.Item>
                  ))}
                </div>
              </SectionCard>
            ))}
            <Card size="small"><span className="muted" style={{ fontSize: 12 }}>{count} settings · stored locally for this prototype (localStorage key <code>careflow.config.{storageKey}</code>). A backend would persist these per practice.</span></Card>
          </Form>
        </Col>
        {sidebar && <Col xs={24} lg={8}>{sidebar}</Col>}
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ 73 General
export function GeneralConfigurationPage() {
  return (
    <ConfigPage storageKey="general" title="General Configuration" subtitle="Practice-wide defaults: identity, locale, working hours and patient identifiers" icon={<Settings size={15} className="muted" />}
      defaults={{ practiceName: 'CareFlow Medical Group', defaultLocation: 'Riverside Medical Center', locale: 'en-US', timezone: 'America/Chicago', dateFormat: 'MMM D, YYYY', timeFormat: '12-hour', currency: 'USD', weekStart: 'Sunday', mrnPrefix: 'MRN-', mrnLength: 6, autoLogoutWarn: true, showPageNumbers: true, defaultLanding: 'Executive Dashboard', supportEmail: 'support@careflow.health' }}
      sections={[
        { title: 'Identity', settings: [{ name: 'practiceName', label: 'Practice name', type: 'text' }, { name: 'defaultLocation', label: 'Default location', type: 'select', options: LOCATION_OPTIONS }, { name: 'supportEmail', label: 'Support email', type: 'text' }, { name: 'defaultLanding', label: 'Default landing page', type: 'select', options: PageRegistry.all().filter((p) => p.module === 'dashboard').map((p) => p.title) }] },
        { title: 'Locale & formats', settings: [{ name: 'locale', label: 'Locale', type: 'select', options: ['en-US', 'en-GB', 'es-US', 'ur-PK'] }, { name: 'timezone', label: 'Time zone', type: 'select', options: ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'Asia/Karachi'] }, { name: 'dateFormat', label: 'Date format', type: 'select', options: ['MMM D, YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] }, { name: 'timeFormat', label: 'Time format', type: 'radio', options: ['12-hour', '24-hour'] }, { name: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'PKR'] }, { name: 'weekStart', label: 'Week starts on', type: 'radio', options: ['Sunday', 'Monday'] }] },
        { title: 'Identifiers & UI', settings: [{ name: 'mrnPrefix', label: 'MRN prefix', type: 'text' }, { name: 'mrnLength', label: 'MRN numeric length', type: 'number', min: 4, max: 12 }, { name: 'showPageNumbers', label: 'Show page numbers in headers (for voice “go to page N”)', type: 'switch' }, { name: 'autoLogoutWarn', label: 'Warn before automatic sign-out', type: 'switch' }] },
      ]} />
  );
}

// ------------------------------------------------------------------ 74 Clinical
export function ClinicalConfigurationPage() {
  return (
    <ConfigPage storageKey="clinical" title="Clinical Configuration" subtitle="Documentation rules, vitals units, coding systems and clinical safety checks" icon={<Stethoscope size={15} className="muted" />}
      defaults={{ codingSystem: 'ICD-10-CM', procedureCoding: 'CPT', noteTemplate: 'SOAP', requireSignOff: true, signOffHours: 48, cosignRoles: ['Nurse'], tempUnit: '°C', weightUnit: 'kg', heightUnit: 'cm', bpAlertSys: 180, bpAlertDia: 110, allergyCheck: true, interactionCheck: true, problemListRequired: true, vitalsRequired: ['Blood pressure', 'Heart rate', 'Weight'], referralExpiry: 90 }}
      sections={[
        { title: 'Coding & documentation', settings: [{ name: 'codingSystem', label: 'Diagnosis coding', type: 'select', options: ['ICD-10-CM', 'ICD-11', 'SNOMED CT'] }, { name: 'procedureCoding', label: 'Procedure coding', type: 'select', options: ['CPT', 'HCPCS', 'ICD-10-PCS'] }, { name: 'noteTemplate', label: 'Default note template', type: 'select', options: ['SOAP', 'Progress', 'APSO', 'Free text'] }, { name: 'requireSignOff', label: 'Require provider sign-off on notes', type: 'switch' }, { name: 'signOffHours', label: 'Sign-off deadline', type: 'number', min: 1, max: 168, suffix: 'hours' }, { name: 'cosignRoles', label: 'Roles requiring co-signature', type: 'multiselect', options: ROLE_OPTIONS }, { name: 'problemListRequired', label: 'Require at least one diagnosis to close an encounter', type: 'switch', span: 2 }] },
        { title: 'Vitals', settings: [{ name: 'tempUnit', label: 'Temperature unit', type: 'radio', options: ['°C', '°F'] }, { name: 'weightUnit', label: 'Weight unit', type: 'radio', options: ['kg', 'lb'] }, { name: 'heightUnit', label: 'Height unit', type: 'radio', options: ['cm', 'in'] }, { name: 'vitalsRequired', label: 'Required vitals per encounter', type: 'multiselect', options: ['Blood pressure', 'Heart rate', 'Temperature', 'SpO₂', 'Respiratory rate', 'Weight', 'Height', 'Pain score'] }, { name: 'bpAlertSys', label: 'Critical systolic alert above', type: 'number', min: 120, max: 260, suffix: 'mmHg' }, { name: 'bpAlertDia', label: 'Critical diastolic alert above', type: 'number', min: 70, max: 160, suffix: 'mmHg' }] },
        { title: 'Safety checks', settings: [{ name: 'allergyCheck', label: 'Check allergies when adding medications', type: 'switch' }, { name: 'interactionCheck', label: 'Drug–drug interaction screening', type: 'switch' }, { name: 'referralExpiry', label: 'Referral validity', type: 'number', min: 30, max: 365, suffix: 'days' }] },
      ]} />
  );
}

// ------------------------------------------------------------------ 75 Appointments
export function AppointmentConfigurationPage() {
  return (
    <ConfigPage storageKey="appointments" title="Appointment Configuration" subtitle="Scheduling rules, booking windows, reminders and no-show policy" icon={<CalendarCog size={15} className="muted" />}
      defaults={{ defaultDuration: 30, slotInterval: 15, bufferMinutes: 5, maxAdvanceDays: 90, minNoticeHours: 2, allowDoubleBooking: false, overbookPercent: 0, onlineBooking: true, onlineTypes: ['Follow-up', 'Telehealth', 'Annual Physical'], reminderChannels: ['SMS', 'Email'], reminderLead: 48, secondReminder: 2, noShowMinutes: 30, noShowFee: 25, cancelWindowHours: 24, waitlist: true, autoConfirm: false }}
      sections={[
        { title: 'Scheduling defaults', settings: [{ name: 'defaultDuration', label: 'Default appointment length', type: 'number', min: 5, max: 240, suffix: 'min' }, { name: 'slotInterval', label: 'Slot interval', type: 'select', options: ['5', '10', '15', '20', '30'] }, { name: 'bufferMinutes', label: 'Buffer between appointments', type: 'number', min: 0, max: 60, suffix: 'min' }, { name: 'maxAdvanceDays', label: 'Maximum advance booking', type: 'number', min: 7, max: 365, suffix: 'days' }, { name: 'minNoticeHours', label: 'Minimum notice for booking', type: 'number', min: 0, max: 72, suffix: 'hours' }, { name: 'autoConfirm', label: 'Auto-confirm bookings', type: 'switch' }, { name: 'allowDoubleBooking', label: 'Allow double booking', type: 'switch' }, { name: 'overbookPercent', label: 'Overbooking allowance', type: 'number', min: 0, max: 50, suffix: '%' }] },
        { title: 'Online booking', settings: [{ name: 'onlineBooking', label: 'Enable patient self-scheduling', type: 'switch' }, { name: 'onlineTypes', label: 'Bookable online', type: 'multiselect', options: FieldRegistry.getForm('appointment')!.fields.find((f) => f.name === 'type')!.options }, { name: 'waitlist', label: 'Enable cancellation waitlist', type: 'switch' }] },
        { title: 'Reminders & no-shows', settings: [{ name: 'reminderChannels', label: 'Reminder channels', type: 'multiselect', options: ['SMS', 'Email', 'Phone', 'Portal'] }, { name: 'reminderLead', label: 'First reminder', type: 'number', min: 1, max: 168, suffix: 'h before' }, { name: 'secondReminder', label: 'Second reminder', type: 'number', min: 0, max: 48, suffix: 'h before' }, { name: 'noShowMinutes', label: 'Mark no-show after', type: 'number', min: 5, max: 120, suffix: 'min' }, { name: 'noShowFee', label: 'No-show fee', type: 'number', min: 0, max: 500, suffix: 'USD' }, { name: 'cancelWindowHours', label: 'Free cancellation window', type: 'number', min: 0, max: 96, suffix: 'hours' }] },
      ]} />
  );
}

// ------------------------------------------------------------------ 76 Medication
export function MedicationConfigurationPage() {
  return (
    <ConfigPage storageKey="medications" title="Medication Configuration" subtitle="Formulary, e-prescribing, refill policy and controlled-substance rules" icon={<Pill size={15} className="muted" />}
      defaults={{ eprescribe: true, defaultPharmacy: 'CVS Pharmacy #1123', genericSubstitution: true, maxRefills: 5, refillWindowDays: 7, controlledRequire2FA: true, controlledMaxDays: 30, pdmpCheck: true, formularyOnly: false, formularyTiers: ['Tier 1 — Generic', 'Tier 2 — Preferred brand'], allergyBlock: 'Hard stop', interactionSeverity: 'Moderate and above', defaultRoute: 'Oral', defaultFrequency: 'Once daily', durationUnit: 'days', requireIndication: true }}
      sections={[
        { title: 'E-prescribing', settings: [{ name: 'eprescribe', label: 'Enable electronic prescribing', type: 'switch' }, { name: 'defaultPharmacy', label: 'Default pharmacy', type: 'select', options: ['CVS Pharmacy #1123', 'Walgreens – Riverside', 'H-E-B Pharmacy', 'Costco Pharmacy', 'Amazon Pharmacy'] }, { name: 'genericSubstitution', label: 'Allow generic substitution by default', type: 'switch' }, { name: 'requireIndication', label: 'Require indication on new medications', type: 'switch' }] },
        { title: 'Defaults for the medication form', description: 'Used to pre-fill fields the user did not specify', settings: [{ name: 'defaultRoute', label: 'Default route', type: 'select', options: FieldRegistry.getForm('medication')!.fields.find((f) => f.name === 'route')!.options }, { name: 'defaultFrequency', label: 'Default frequency', type: 'select', options: FieldRegistry.getForm('medication')!.fields.find((f) => f.name === 'frequency')!.options }, { name: 'durationUnit', label: 'Duration unit', type: 'radio', options: ['days', 'weeks'] }] },
        { title: 'Refills & controlled substances', settings: [{ name: 'maxRefills', label: 'Maximum refills', type: 'number', min: 0, max: 12 }, { name: 'refillWindowDays', label: 'Refill request window', type: 'number', min: 1, max: 30, suffix: 'days' }, { name: 'controlledRequire2FA', label: 'Require 2FA for controlled substances (EPCS)', type: 'switch' }, { name: 'controlledMaxDays', label: 'Max controlled-substance supply', type: 'number', min: 7, max: 90, suffix: 'days' }, { name: 'pdmpCheck', label: 'Check PDMP before controlled prescriptions', type: 'switch' }] },
        { title: 'Formulary & safety', settings: [{ name: 'formularyOnly', label: 'Restrict to formulary medications', type: 'switch' }, { name: 'formularyTiers', label: 'Preferred tiers', type: 'multiselect', options: ['Tier 1 — Generic', 'Tier 2 — Preferred brand', 'Tier 3 — Non-preferred', 'Tier 4 — Specialty'] }, { name: 'allergyBlock', label: 'On documented allergy', type: 'radio', options: ['Warn', 'Hard stop'] }, { name: 'interactionSeverity', label: 'Alert on interactions', type: 'select', options: ['All', 'Moderate and above', 'Severe only'] }] },
      ]} />
  );
}

// ------------------------------------------------------------------ 77 Notifications
export function NotificationConfigurationPage() {
  return (
    <ConfigPage storageKey="notifications" title="Notification Configuration" subtitle="Patient communications, staff alerts and delivery channels" icon={<Bell size={15} className="muted" />}
      defaults={{ smsProvider: 'Twilio', smsSender: '+1 512 555 0100', emailFrom: 'no-reply@careflow.health', emailProvider: 'SendGrid', quietStart: '21:00', quietEnd: '08:00', patientEvents: ['Appointment booked', 'Appointment reminder', 'Lab results available', 'Prescription sent'], staffEvents: ['Abnormal result', 'Queue wait > threshold', 'Credential expiring', 'Leave request'], waitThreshold: 15, credentialLeadDays: 60, digest: 'Daily', inApp: true, desktop: false, escalation: true, escalationMinutes: 30 }}
      sections={[
        { title: 'Channels', settings: [{ name: 'smsProvider', label: 'SMS provider', type: 'select', options: ['Twilio', 'Vonage', 'AWS SNS'] }, { name: 'smsSender', label: 'SMS sender ID', type: 'text' }, { name: 'emailProvider', label: 'Email provider', type: 'select', options: ['SendGrid', 'Amazon SES', 'SMTP'] }, { name: 'emailFrom', label: 'From address', type: 'text' }, { name: 'inApp', label: 'In-app notifications', type: 'switch' }, { name: 'desktop', label: 'Browser desktop notifications', type: 'switch' }] },
        { title: 'Patient notifications', settings: [{ name: 'patientEvents', label: 'Send patients notifications for', type: 'multiselect', span: 2, options: ['Appointment booked', 'Appointment reminder', 'Appointment cancelled', 'Lab results available', 'Prescription sent', 'Referral update', 'Balance due', 'Portal message'] }, { name: 'quietStart', label: 'Quiet hours start', type: 'text' }, { name: 'quietEnd', label: 'Quiet hours end', type: 'text' }] },
        { title: 'Staff alerts', settings: [{ name: 'staffEvents', label: 'Alert staff on', type: 'multiselect', span: 2, options: ['Abnormal result', 'STAT order', 'Queue wait > threshold', 'Credential expiring', 'Leave request', 'Failed login', 'Room maintenance'] }, { name: 'waitThreshold', label: 'Queue wait threshold', type: 'number', min: 5, max: 60, suffix: 'min' }, { name: 'credentialLeadDays', label: 'Credential expiry warning', type: 'number', min: 7, max: 180, suffix: 'days ahead' }, { name: 'digest', label: 'Summary digest', type: 'radio', options: ['Off', 'Daily', 'Weekly'] }, { name: 'escalation', label: 'Escalate unacknowledged critical alerts', type: 'switch' }, { name: 'escalationMinutes', label: 'Escalate after', type: 'number', min: 5, max: 120, suffix: 'min' }] },
      ]} />
  );
}

// ------------------------------------------------------------------ 78 Security
export function SecurityConfigurationPage() {
  return (
    <ConfigPage storageKey="security" title="Security Configuration" subtitle="Encryption, audit, data retention and privacy controls" icon={<Shield size={15} className="muted" />}
      defaults={{ encryptionAtRest: 'AES-256', tlsMin: 'TLS 1.2', auditRetentionYears: 7, recordRetentionYears: 10, autoLogoutMinutes: 30, maskPhi: true, watermarkExports: true, phiExportApproval: true, backupFrequency: 'Hourly', backupRegion: 'us-east-1', drTestQuarterly: true, apiKeysRotateDays: 90, webhookSecret: '••••••••••••', allowedOrigins: 'https://app.careflow.health', breachContact: 'privacy@careflow.health' }}
      sections={[
        { title: 'Encryption & transport', settings: [{ name: 'encryptionAtRest', label: 'Encryption at rest', type: 'select', options: ['AES-256', 'AES-128'] }, { name: 'tlsMin', label: 'Minimum TLS version', type: 'select', options: ['TLS 1.2', 'TLS 1.3'] }, { name: 'apiKeysRotateDays', label: 'Rotate API keys every', type: 'number', min: 30, max: 365, suffix: 'days' }, { name: 'webhookSecret', label: 'Webhook signing secret', type: 'password' }, { name: 'allowedOrigins', label: 'Allowed CORS origins', type: 'textarea', span: 2 }] },
        { title: 'Privacy & PHI handling', settings: [{ name: 'maskPhi', label: 'Mask PHI in lists until hovered', type: 'switch' }, { name: 'watermarkExports', label: 'Watermark printed / exported documents', type: 'switch' }, { name: 'phiExportApproval', label: 'Require approval for bulk PHI export', type: 'switch' }, { name: 'autoLogoutMinutes', label: 'Automatic sign-out after inactivity', type: 'number', min: 5, max: 120, suffix: 'min' }, { name: 'breachContact', label: 'Privacy officer contact', type: 'text' }] },
        { title: 'Retention & backup', settings: [{ name: 'auditRetentionYears', label: 'Audit log retention', type: 'number', min: 1, max: 15, suffix: 'years' }, { name: 'recordRetentionYears', label: 'Medical record retention', type: 'number', min: 5, max: 30, suffix: 'years' }, { name: 'backupFrequency', label: 'Backup frequency', type: 'select', options: ['Hourly', 'Every 6 hours', 'Daily'] }, { name: 'backupRegion', label: 'Backup region', type: 'select', options: ['us-east-1', 'us-west-2', 'eu-west-1'] }, { name: 'drTestQuarterly', label: 'Quarterly disaster-recovery test', type: 'switch' }] },
      ]}
      sidebar={<SectionCard title="Compliance posture"><div className="flex gap-2 wrap" style={{ marginBottom: 12 }}><Tag color="green">HIPAA</Tag><Tag color="green">SOC 2 Type II</Tag><Tag color="blue">HITRUST (in progress)</Tag></div><Alert type="info" showIcon message="Voice data" description="Audio is processed by local models only (omi-med-stt + Qwen). No audio or transcripts leave the device in local mode." /></SectionCard>} />
  );
}

// ------------------------------------------------------------------ 79 System preferences (incl. voice/AI runtime)
export function SystemPreferencesPage() {
  const cfg = effectiveConfig();
  return (
    <ConfigPage storageKey="preferences" title="System Preferences" subtitle="Personal UI preferences and voice assistant behaviour" icon={<SlidersHorizontal size={15} className="muted" />}
      defaults={{ theme: 'Light', density: 'Comfortable', sidebarDefault: 'Expanded', tableRows: 15, landing: 'Executive Dashboard', voiceEnabled: true, voiceAutoListen: false, voiceConfirmMode: 'Always ask before saving', voiceLanguage: 'en-US', voiceFeedback: 'Text', voiceTimeout: 12, showDebug: aiConfig.enableDebugPanel, keyboardHints: true, animations: true }}
      sections={[
        { title: 'Appearance', settings: [{ name: 'theme', label: 'Theme', type: 'radio', options: ['Light', 'Dark', 'System'] }, { name: 'density', label: 'Density', type: 'radio', options: ['Compact', 'Comfortable'] }, { name: 'sidebarDefault', label: 'Sidebar on launch', type: 'radio', options: ['Expanded', 'Collapsed'] }, { name: 'tableRows', label: 'Default rows per table', type: 'select', options: ['10', '15', '25', '50'] }, { name: 'landing', label: 'Landing page', type: 'select', options: PageRegistry.all().filter((p) => !p.requiresContext && p.module !== 'dev').map((p) => p.title) }, { name: 'animations', label: 'Enable animations', type: 'switch' }, { name: 'keyboardHints', label: 'Show keyboard shortcut hints', type: 'switch' }] },
        { title: 'Voice assistant', description: 'Runtime providers are configured via .env / Voice Console', settings: [{ name: 'voiceEnabled', label: 'Enable voice assistant', type: 'switch' }, { name: 'voiceAutoListen', label: 'Start listening when the panel opens', type: 'switch' }, { name: 'voiceConfirmMode', label: 'Save confirmation', type: 'select', options: ['Always ask before saving'] , help: 'Saving without explicit confirmation is disabled by design.' }, { name: 'voiceLanguage', label: 'Recognition language', type: 'select', options: ['en-US', 'en-GB', 'en-IN'] }, { name: 'voiceFeedback', label: 'Assistant feedback', type: 'radio', options: ['Text', 'Text + chime'] }, { name: 'voiceTimeout', label: 'Max listening duration', type: 'number', min: 5, max: 30, suffix: 's' }, { name: 'showDebug', label: 'Show debug panel button', type: 'switch' }] },
      ]}
      sidebar={<SectionCard title={<span className="flex items-center gap-2"><ClipboardList size={15} /> Active AI runtime</span>}><dl className="debug-kv"><dt>Mode</dt><dd><Tag color={cfg.mode === 'mock' ? 'default' : 'blue'}>{cfg.mode}</Tag></dd><dt>STT provider</dt><dd>{cfg.stt.provider}</dd><dt>STT endpoint</dt><dd className="mono">{cfg.stt.apiUrl}</dd><dt>LLM provider</dt><dd>{cfg.llm.provider}</dd><dt>LLM model</dt><dd className="mono">{cfg.llm.model}</dd><dt>LLM endpoint</dt><dd className="mono">{cfg.llm.apiUrl}</dd><dt>Fallback to rules</dt><dd>{cfg.fallbackToRules ? 'Yes' : 'No'}</dd></dl><p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Change providers at runtime in the Voice Test Console (page 90), or permanently via <code>.env</code>.</p></SectionCard>} />
  );
}
