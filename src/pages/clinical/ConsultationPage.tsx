import { useMemo, useState } from 'react';
import { Anchor, Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Radio, Row, Select, Space, Steps, Tag, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, FlaskConical, Pill, Plus, Save, Scan, Send, Stethoscope } from 'lucide-react';
import { PageHeader, SectionCard, StatusTag, Avatar, KeyValue } from '@/components/common';
import { MedicationFormDrawer } from '@/components/forms/MedicationForm';
import { AllergyFormDrawer, ImagingOrderFormDrawer, LabOrderFormDrawer, ProblemFormDrawer, ReferralFormDrawer } from '@/components/forms/ClinicalForms';
import { useAppDispatch, useAppSelector } from '@/store';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { medicationSelectors } from '@/store/slices/medicationSlice';
import { useScrollSection } from '@/hooks';
import { mockDb, noteService } from '@/services/api';
import { dayjs, formatDate } from '@/utils/format';

const SECTIONS = [
  ['patient', 'Patient Summary'], ['complaint', 'Chief Complaint'], ['vitals', 'Vitals'], ['history', 'History'], ['exam', 'Examination'], ['assessment', 'Assessment'],
  ['diagnosis', 'Diagnosis'], ['medication', 'Medication'], ['orders', 'Orders'], ['plan', 'Treatment Plan'], ['followup', 'Follow-up'],
] as const;

function Section({ id, title, children, extra }: { id: string; title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  const ref = useScrollSection(id, title);
  return (
    <div ref={ref} id={`consult-${id}`} style={{ scrollMarginTop: 80 }}>
      <SectionCard title={title} extra={extra}>{children}</SectionCard>
    </div>
  );
}

export default function ConsultationPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const patientId = params.get('patient') ?? currentPatientId ?? undefined;
  const patient = patients.find((p) => p.id === patientId);
  const meds = useAppSelector((s) => medicationSelectors.selectAll(s).filter((m) => m.patientId === patientId && m.status === 'Active'));
  const user = useAppSelector((s) => s.auth.user);
  const [form] = Form.useForm();
  const [drawer, setDrawer] = useState<null | 'medication' | 'allergy' | 'problem' | 'lab' | 'imaging' | 'referral'>(null);
  const [step, setStep] = useState(0);
  const allergies = useMemo(() => mockDb.allergies.filter((a) => a.patientId === patientId && a.status === 'Active'), [patientId]);
  const problems = useMemo(() => mockDb.problems.filter((p) => p.patientId === patientId && p.status !== 'Resolved'), [patientId]);
  const lastVitals = useMemo(() => mockDb.vitals.filter((v) => v.patientId === patientId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0], [patientId]);

  const selectPatient = (id: string) => {
    dispatch(setCurrentPatient(id));
    setParams({ patient: id });
  };

  const saveNote = async (status: 'Draft' | 'Signed') => {
    const v = form.getFieldsValue();
    if (!patient) return message.warning('Select a patient first');
    await noteService.create({ patientId: patient.id, patientName: patient.fullName, type: 'Progress', title: `Consultation – ${v.chiefComplaint || 'Visit'}`, author: user?.fullName ?? 'Provider', createdAt: new Date().toISOString(), status, body: [`CC: ${v.chiefComplaint ?? ''}`, `HPI: ${v.hpi ?? ''}`, `Exam: ${v.exam ?? ''}`, `Assessment: ${v.assessment ?? ''}`, `Plan: ${v.plan ?? ''}`].join('\n') });
    message.success(status === 'Signed' ? 'Consultation signed and closed' : 'Consultation saved as draft');
    if (status === 'Signed') navigate('/clinical');
  };

  return (
    <>
      <PageHeader
        title="Consultation"
        subtitle={patient ? `${patient.fullName} · ${patient.mrn} · ${dayjs().format('MMM D, YYYY h:mm A')}` : 'Select a patient to begin the encounter'}
        actions={
          <>
            <Select showSearch placeholder="Select patient" style={{ width: 260 }} value={patient?.id} onChange={selectPatient} optionFilterProp="label" options={patients.map((p) => ({ value: p.id, label: `${p.fullName} · ${p.mrn}` }))} />
            <Button icon={<Save size={15} />} onClick={() => void saveNote('Draft')}>Save Draft</Button>
            <Button type="primary" icon={<CheckCircle2 size={15} />} onClick={() => void saveNote('Signed')}>Sign & Close</Button>
          </>
        }
      />
      <Steps size="small" current={step} onChange={setStep} style={{ marginBottom: 20 }} items={[{ title: 'Intake' }, { title: 'Examination' }, { title: 'Assessment' }, { title: 'Orders & Plan' }, { title: 'Sign-off' }]} />
      <div className="consult-layout">
        <div className="consult-nav">
          <Card size="small" title="Sections">
            <Anchor affix={false} offsetTop={80} items={SECTIONS.map(([id, title]) => ({ key: id, href: `#consult-${id}`, title }))} />
          </Card>
          {patient && (
            <Card size="small" title="Alerts" style={{ marginTop: 12 }}>
              {allergies.length ? allergies.map((a) => <Tag key={a.id} color="red" style={{ marginBottom: 4 }}>{a.allergen}</Tag>) : <span className="muted">No allergies</span>}
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{problems.length} active problem{problems.length === 1 ? '' : 's'} · {meds.length} active med{meds.length === 1 ? '' : 's'}</div>
            </Card>
          )}
        </div>
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ visitDate: dayjs(), followUpUnit: 'weeks', followUpValue: 4 }}>
          <Section id="patient" title="Patient Summary">
            {patient ? (
              <div className="flex gap-3" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Avatar name={patient.fullName} size={48} />
                <div style={{ flex: 1 }}>
                  <KeyValue columns={4} items={[{ label: 'Name', value: patient.fullName }, { label: 'Age / Sex', value: `${patient.age} y · ${patient.gender}` }, { label: 'MRN', value: patient.mrn }, { label: 'PCP', value: patient.primaryProviderName }, { label: 'Insurance', value: patient.insuranceProvider }, { label: 'Last visit', value: formatDate(patient.lastVisit) }, { label: 'Risk', value: <StatusTag status={patient.riskLevel} /> }, { label: 'Language', value: patient.language }]} />
                </div>
              </div>
            ) : <span className="muted">No patient selected. Use the selector above or say “open John Smith”.</span>}
          </Section>

          <Section id="complaint" title="Chief Complaint & HPI">
            <Row gutter={16}>
              <Col xs={24} md={16}><Form.Item name="chiefComplaint" label="Chief complaint" rules={[{ required: true, message: 'Chief complaint is required' }]}><Input placeholder="e.g. Chest pain for 2 days" /></Form.Item></Col>
              <Col xs={12} md={4}><Form.Item name="visitDate" label="Visit date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
              <Col xs={12} md={4}><Form.Item name="visitType" label="Visit type" initialValue="Follow-up"><Select options={['New Patient', 'Follow-up', 'Urgent', 'Telehealth'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col span={24}><Form.Item name="hpi" label="History of present illness"><Input.TextArea rows={4} placeholder="Onset, location, duration, character, aggravating/relieving factors, timing, severity" /></Form.Item></Col>
            </Row>
          </Section>

          <Section id="vitals" title="Vitals" extra={lastVitals && <span className="muted" style={{ fontSize: 12 }}>Previous: {lastVitals.systolic}/{lastVitals.diastolic} · HR {lastVitals.heartRate} · {lastVitals.weightKg} kg</span>}>
            <Row gutter={12}>
              {[['systolic', 'Systolic', 'mmHg'], ['diastolic', 'Diastolic', 'mmHg'], ['heartRate', 'Heart rate', 'bpm'], ['respRate', 'Resp. rate', '/min'], ['temperature', 'Temp', '°C'], ['spo2', 'SpO₂', '%'], ['weight', 'Weight', 'kg'], ['height', 'Height', 'cm']].map(([name, label, unit]) => (
                <Col xs={12} sm={8} md={6} lg={3} key={name}><Form.Item name={name} label={label}><InputNumber style={{ width: '100%' }} addonAfter={unit} /></Form.Item></Col>
              ))}
              <Col xs={24} md={12}><Form.Item name="pain" label="Pain score"><Radio.Group optionType="button" buttonStyle="solid" size="small" options={Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }))} /></Form.Item></Col>
            </Row>
          </Section>

          <Section id="history" title="History">
            <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item name="pmh" label="Past medical history"><Input.TextArea rows={3} placeholder={problems.map((p) => p.description).join('; ') || 'None documented'} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="medsReview" label="Medication reconciliation"><Checkbox.Group options={meds.map((m) => ({ value: m.id, label: `${m.name} ${m.dosage} — ${m.frequency}` }))} style={{ display: 'flex', flexDirection: 'column', gap: 4 }} /></Form.Item>{!meds.length && <span className="muted">No active medications</span>}</Col>
              <Col xs={24} md={8}><Form.Item name="allergiesReviewed" valuePropName="checked"><Checkbox>Allergies reviewed with patient</Checkbox></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="socialHistory" label="Social history"><Select mode="tags" placeholder="e.g. Never smoker" options={['Never smoker', 'Former smoker', 'Current smoker', 'Alcohol: none', 'Alcohol: moderate', 'Sedentary', 'Active'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="familyHistory" label="Family history"><Select mode="tags" placeholder="Add condition" options={['Diabetes', 'Hypertension', 'CAD', 'Cancer', 'Stroke', 'Asthma'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
            </Row>
          </Section>

          <Section id="exam" title="Physical Examination">
            <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item name="general" label="General appearance"><Select options={['Well-appearing, NAD', 'Mild distress', 'Moderate distress', 'Acutely ill'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="systems" label="Systems examined"><Select mode="multiple" options={['CVS', 'Respiratory', 'Abdomen', 'Neuro', 'MSK', 'Skin', 'HEENT', 'Psych'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col span={24}><Form.Item name="exam" label="Examination findings"><Input.TextArea rows={4} placeholder="Document pertinent positive and negative findings" /></Form.Item></Col>
            </Row>
          </Section>

          <Section id="assessment" title="Assessment">
            <Form.Item name="assessment" label="Clinical impression"><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="acuity" label="Acuity"><Radio.Group options={['Stable', 'Improving', 'Worsening', 'Critical'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          </Section>

          <Section id="diagnosis" title="Diagnosis" extra={<Button size="small" icon={<Plus size={13} />} onClick={() => setDrawer('problem')} disabled={!patient}>Add Diagnosis</Button>}>
            {problems.length ? problems.map((p) => (<div key={p.id} className="list-row"><Tag style={{ fontFamily: 'monospace', margin: 0 }}>{p.icd10}</Tag><div className="list-row-main"><div className="list-row-title">{p.description}</div><div className="list-row-sub">Since {formatDate(p.onsetDate)}</div></div><StatusTag status={p.status} /></div>)) : <span className="muted">No active diagnoses. Add one to this encounter.</span>}
          </Section>

          <Section id="medication" title="Medication" extra={<Button size="small" icon={<Pill size={13} />} onClick={() => setDrawer('medication')} disabled={!patient}>Add Medication</Button>}>
            {meds.length ? meds.map((m) => (<div key={m.id} className="list-row"><div className="list-row-main"><div className="list-row-title">{m.name} {m.dosage}</div><div className="list-row-sub">{m.route} · {m.frequency} · {m.duration}</div></div><StatusTag status={m.status} /></div>)) : <span className="muted">No active medications. Say “add Amoxicillin 500 mg twice daily for 7 days”.</span>}
          </Section>

          <Section id="orders" title="Orders">
            <Space wrap>
              <Button icon={<FlaskConical size={14} />} onClick={() => setDrawer('lab')} disabled={!patient}>Order Lab</Button>
              <Button icon={<Scan size={14} />} onClick={() => setDrawer('imaging')} disabled={!patient}>Order Imaging</Button>
              <Button icon={<Send size={14} />} onClick={() => setDrawer('referral')} disabled={!patient}>Refer</Button>
              <Button icon={<Stethoscope size={14} />} onClick={() => setDrawer('allergy')} disabled={!patient}>Record Allergy</Button>
            </Space>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Orders placed during this encounter appear in the Labs, Imaging and Referrals modules.</div>
          </Section>

          <Section id="plan" title="Treatment Plan">
            <Form.Item name="plan" label="Plan"><Input.TextArea rows={4} placeholder="Medications, lifestyle advice, monitoring, patient education" /></Form.Item>
            <Form.Item name="education" label="Patient education provided"><Checkbox.Group options={['Medication adherence', 'Diet & exercise', 'Warning signs', 'Return precautions', 'Written materials given']} /></Form.Item>
          </Section>

          <Section id="followup" title="Follow-up & Disposition">
            <Row gutter={16}>
              <Col xs={12} md={4}><Form.Item name="followUpValue" label="Follow up in"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col xs={12} md={4}><Form.Item name="followUpUnit" label=" "><Select options={['days', 'weeks', 'months'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="disposition" label="Disposition" initialValue="Home"><Select options={['Home', 'Home with services', 'Referred', 'Admitted', 'Emergency department'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="timeSpent" label="Time spent (minutes)"><InputNumber min={5} max={180} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <div className="sticky-actions">
              <Button icon={<Save size={14} />} onClick={() => void saveNote('Draft')}>Save Draft</Button>
              <Button type="primary" icon={<CheckCircle2 size={14} />} onClick={() => void saveNote('Signed')}>Sign & Close Encounter</Button>
            </div>
          </Section>
        </Form>
      </div>

      <MedicationFormDrawer open={drawer === 'medication'} onOpen={() => setDrawer('medication')} onClose={() => setDrawer(null)} patient={patient} />
      <AllergyFormDrawer open={drawer === 'allergy'} onOpen={() => setDrawer('allergy')} onClose={() => setDrawer(null)} patient={patient} />
      <ProblemFormDrawer open={drawer === 'problem'} onOpen={() => setDrawer('problem')} onClose={() => setDrawer(null)} patient={patient} />
      <LabOrderFormDrawer open={drawer === 'lab'} onOpen={() => setDrawer('lab')} onClose={() => setDrawer(null)} patient={patient} />
      <ImagingOrderFormDrawer open={drawer === 'imaging'} onOpen={() => setDrawer('imaging')} onClose={() => setDrawer(null)} patient={patient} />
      <ReferralFormDrawer open={drawer === 'referral'} onOpen={() => setDrawer('referral')} onClose={() => setDrawer(null)} patient={patient} />
    </>
  );
}
