import { useMemo } from 'react';
import { Button, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, ListChecks, Pill, Repeat, Stethoscope, TriangleAlert } from 'lucide-react';
import dayjs from 'dayjs';
import { usePatientOverview, useSelectedPatient } from '@/hooks/usePatientData';
import { BarsChart, DonutChart, TrendChart } from '@/components/charts';
import { EmptyState, InlineEmpty, MetricCard, MetricGrid, PageHeader, SectionCard, StatusTag } from '@/components/common';
import { formatDate, formatTime } from '@/utils/format';

/** Count rows by a property, keeping only the values that actually occur. */
function countBy<T>(rows: T[], key: (row: T) => string): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const k = key(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/**
 * The dashboard of the selected patient: the numbers that matter, a chart per
 * record type where it genuinely helps, and everything that is due or overdue.
 */
export default function DashboardPage() {
  const patient = useSelectedPatient();
  const navigate = useNavigate();
  const { medications, diagnoses, tasks, recalls, appointments, counts, highlights, loading } = usePatientOverview();

  const medicationStatus = useMemo(() => countBy(medications, (m) => m.status), [medications]);
  const diagnosisStatus = useMemo(() => countBy(diagnoses, (d) => d.status), [diagnoses]);
  const taskStatus = useMemo(() => countBy(tasks, (t) => t.status).map((d) => ({ name: d.name, count: d.value })), [tasks]);
  const recallStatus = useMemo(() => countBy(recalls, (r) => r.status), [recalls]);

  /** Appointments per month, six months back and three forward — shows the care rhythm. */
  const appointmentTrend = useMemo(() => {
    const months = Array.from({ length: 10 }, (_, i) => dayjs().subtract(6 - i, 'month').startOf('month'));
    return months.map((m) => ({
      month: m.format('MMM YY'),
      count: appointments.filter((a) => dayjs(a.date).isSame(m, 'month')).length,
    }));
  }, [appointments]);

  const overdueTasks = useMemo(
    () => tasks.filter((t) => (t.status === 'Open' || t.status === 'In Progress') && dayjs(t.dueDate).isBefore(dayjs().startOf('day'))).slice(0, 4),
    [tasks],
  );
  const dueRecalls = useMemo(() => recalls.filter((r) => r.status === 'Due').sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4), [recalls]);
  const activeMedications = useMemo(() => medications.filter((m) => m.status === 'Active').slice(0, 5), [medications]);
  const activeDiagnoses = useMemo(() => diagnoses.filter((d) => d.status === 'Active' || d.status === 'Chronic').slice(0, 5), [diagnoses]);

  const hasAnyData = counts.medication + counts.diagnosis + counts.task + counts.recall + counts.appointment > 0;

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle={patient ? `Everything recorded for ${patient.fullName}, at a glance.` : 'Select a patient to see their overview.'}
      />

      <MetricGrid>
        <MetricCard label="Active medications" value={highlights.activeMedications} icon={<Pill size={18} />} tone="primary" hint={`${counts.medication} medications in total`} onClick={() => navigate('/medications')} loading={loading} />
        <MetricCard label="Active diagnoses" value={highlights.activeDiagnoses} icon={<Stethoscope size={18} />} tone="info" hint={`${counts.diagnosis} diagnoses in total, including resolved`} onClick={() => navigate('/diagnoses')} loading={loading} />
        <MetricCard
          label="Open tasks"
          value={highlights.openTasks}
          icon={<ListChecks size={18} />}
          tone={highlights.overdueTasks ? 'error' : 'success'}
          hint={highlights.overdueTasks ? `${highlights.overdueTasks} of them are overdue` : 'Nothing overdue'}
          onClick={() => navigate('/tasks')}
          loading={loading}
        />
        <MetricCard label="Recalls due" value={highlights.dueRecalls} icon={<Repeat size={18} />} tone={highlights.dueRecalls ? 'warning' : 'neutral'} hint={`${counts.recall} recalls in total`} onClick={() => navigate('/recalls')} loading={loading} />
        <MetricCard
          label="Next appointment"
          value={highlights.nextAppointment ? formatDate(highlights.nextAppointment.date, 'D MMM') : 'None booked'}
          icon={<CalendarDays size={18} />}
          tone="primary"
          hint={highlights.nextAppointment ? `${highlights.nextAppointment.type} with ${highlights.nextAppointment.providerName} at ${formatTime(highlights.nextAppointment.startTime)}` : `${counts.appointment} appointments in history`}
          onClick={() => navigate('/appointments')}
          loading={loading}
        />
      </MetricGrid>

      {!loading && !hasAnyData ? (
        <SectionCard>
          <EmptyState
            title={`Nothing recorded for ${patient?.fullName ?? 'this patient'} yet`}
            description="Add a medication, diagnosis, task, recall or appointment — or dictate a paragraph in the Summary module and let the AI extract it."
            action={
              <Button type="primary" onClick={() => navigate('/summary/ai-summary')}>
                Open AI Summary <ArrowRight size={14} style={{ marginInlineStart: 6 }} />
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <>
          <div className="dashboard-grid">
            <SectionCard title="What needs attention" icon={<TriangleAlert size={16} />} description="Overdue tasks and recalls that are due, plus the next booked visit.">
              {highlights.nextAppointment && (
                <div className="attention-row is-info">
                  <CalendarDays size={15} aria-hidden />
                  <div>
                    <strong>{highlights.nextAppointment.type}</strong> with {highlights.nextAppointment.providerName}
                    <div className="muted">{formatDate(highlights.nextAppointment.date)} at {formatTime(highlights.nextAppointment.startTime)} · {highlights.nextAppointment.reason}</div>
                  </div>
                  <Button type="link" size="small" onClick={() => navigate('/appointments')}>View</Button>
                </div>
              )}
              {overdueTasks.map((t) => (
                <div key={t.id} className="attention-row is-danger">
                  <ListChecks size={15} aria-hidden />
                  <div>
                    <strong>{t.title}</strong> <Tag color="red">Overdue</Tag>
                    <div className="muted">Due {formatDate(t.dueDate)} · {t.assignedTo}</div>
                  </div>
                  <Button type="link" size="small" onClick={() => navigate('/tasks')}>Open</Button>
                </div>
              ))}
              {dueRecalls.map((r) => (
                <div key={r.id} className="attention-row is-warning">
                  <Repeat size={15} aria-hidden />
                  <div>
                    <strong>{r.reason}</strong> <Tag color="gold">{r.type}</Tag>
                    <div className="muted">Due {formatDate(r.dueDate)}</div>
                  </div>
                  <Button type="link" size="small" onClick={() => navigate('/recalls')}>Open</Button>
                </div>
              ))}
              {!highlights.nextAppointment && !overdueTasks.length && !dueRecalls.length && (
                <InlineEmpty>Nothing is overdue and no visit is booked.</InlineEmpty>
              )}
            </SectionCard>

            <SectionCard title="Current medications" icon={<Pill size={16} />} count={highlights.activeMedications} extra={<Button type="link" size="small" onClick={() => navigate('/medications')}>All medications</Button>}>
              {activeMedications.length ? (
                <ul className="mini-list">
                  {activeMedications.map((m) => (
                    <li key={m.id}>
                      <span className="mini-list-main">
                        <strong>{m.name}</strong>
                        <span className="muted">{[m.dosage, m.frequency, m.route].filter(Boolean).join(' · ')}</span>
                      </span>
                      <StatusTag status={m.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <InlineEmpty>No active medications.</InlineEmpty>
              )}
            </SectionCard>

            <SectionCard title="Active problem list" icon={<Stethoscope size={16} />} count={highlights.activeDiagnoses} extra={<Button type="link" size="small" onClick={() => navigate('/diagnoses')}>All diagnoses</Button>}>
              {activeDiagnoses.length ? (
                <ul className="mini-list">
                  {activeDiagnoses.map((d) => (
                    <li key={d.id}>
                      <span className="mini-list-main">
                        <strong>{d.description}</strong>
                        <span className="muted">{[d.icd10, `since ${formatDate(d.onsetDate, 'MMM YYYY')}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <StatusTag status={d.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <InlineEmpty>No active or chronic diagnoses.</InlineEmpty>
              )}
            </SectionCard>
          </div>

          <div className="dashboard-grid charts">
            {medicationStatus.length > 0 && (
              <SectionCard title="Medication overview" icon={<Pill size={16} />} description="How this patient's medications are split between active, completed, on hold and discontinued.">
                <DonutChart data={medicationStatus} height={200} />
              </SectionCard>
            )}
            {diagnosisStatus.length > 0 && (
              <SectionCard title="Diagnosis distribution" icon={<Stethoscope size={16} />} description="The problem list by status — how much is active versus historical.">
                <DonutChart data={diagnosisStatus} height={200} />
              </SectionCard>
            )}
            {taskStatus.length > 0 && (
              <SectionCard title="Task status" icon={<ListChecks size={16} />} description="Where this patient's tasks stand.">
                <BarsChart data={taskStatus} xKey="name" series={[{ key: 'count', label: 'Tasks' }]} height={210} horizontal />
              </SectionCard>
            )}
            {recallStatus.length > 0 && (
              <SectionCard title="Recall status" icon={<Repeat size={16} />} description="Recalls that are due, booked, done or cancelled.">
                <DonutChart data={recallStatus} height={200} />
              </SectionCard>
            )}
            {appointments.length > 0 && (
              <SectionCard title="Appointment activity" icon={<CalendarDays size={16} />} description="Visits per month — six months back and three ahead." className="span-2">
                <TrendChart data={appointmentTrend} xKey="month" series={[{ key: 'count', label: 'Appointments' }]} height={220} />
              </SectionCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
