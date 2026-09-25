import { useMemo } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ListChecks, Pill, Repeat, Sparkles, Stethoscope, TriangleAlert, Volume2, X } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { usePatientOverview, useSelectedPatient } from '@/hooks/usePatientData';
import { buildPatientNarrative } from '@/services/records/patientNarrative';
import { speak } from '@/services/ai/speech';
import { Avatar, InlineEmpty, StatusTag } from '@/components/common';
import { formatDate, formatTime } from '@/utils/format';
import { PageRegistry } from '@/registry/pageRegistry';

/**
 * The selected patient at a glance, docked to the right of the screen so it
 * stays visible whatever page is open. The assistant opens and closes it with
 * the `show_patient_summary_panel` tool.
 *
 * It reads the same data as the Summary (usePatientOverview) so the two can
 * never disagree, and shows it as one scrollable column: the numbers, what
 * needs attention, the current medications and problems, what is booked, and
 * the same narrative the assistant reads aloud.
 */
export function PatientSummaryPanel() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const patient = useSelectedPatient();
  const { medications, diagnoses, tasks, recalls, appointments, counts, highlights, loading } = usePatientOverview();

  const close = () => dispatch(uiActions.setPatientPanelOpen(false));

  const narrative = useMemo(
    () => (patient ? buildPatientNarrative({ patient, medications, diagnoses, tasks, recalls, appointments }) : null),
    [patient, medications, diagnoses, tasks, recalls, appointments],
  );

  const overdueTasks = useMemo(
    () => tasks.filter((t) => (t.status === 'Open' || t.status === 'In Progress') && dayjs(t.dueDate).isBefore(dayjs().startOf('day'))),
    [tasks],
  );
  const dueRecalls = useMemo(() => recalls.filter((r) => r.status === 'Due').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [recalls]);
  const activeMedications = useMemo(() => medications.filter((m) => m.status === 'Active'), [medications]);
  const activeDiagnoses = useMemo(() => diagnoses.filter((d) => d.status === 'Active' || d.status === 'Chronic'), [diagnoses]);
  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((a) => !dayjs(a.date).isBefore(dayjs().startOf('day')) && !['Cancelled', 'No Show', 'Completed'].includes(a.status))
        .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
    [appointments],
  );

  if (!patient) return null;

  const stats: Array<{ label: string; value: string | number; hint: string; tone: string; path: string }> = [
    { label: 'Active meds', value: highlights.activeMedications, hint: `${counts.medication} in total`, tone: 'primary', path: PageRegistry.recordTab('medication').path },
    { label: 'Active problems', value: highlights.activeDiagnoses, hint: `${counts.diagnosis} in total`, tone: 'info', path: PageRegistry.recordTab('diagnosis').path },
    { label: 'Open tasks', value: highlights.openTasks, hint: highlights.overdueTasks ? `${highlights.overdueTasks} overdue` : 'None overdue', tone: highlights.overdueTasks ? 'error' : 'success', path: PageRegistry.recordTab('task').path },
    { label: 'Recalls due', value: highlights.dueRecalls, hint: `${counts.recall} in total`, tone: highlights.dueRecalls ? 'warning' : 'neutral', path: PageRegistry.recordTab('recall').path },
  ];

  return (
    <aside className="dash-dock" aria-label="Patient summary panel">
      <header className="dash-dock-head">
        <span className="dash-dock-mark" aria-hidden>
          <Sparkles size={15} />
        </span>
        <div className="dash-dock-title">
          <strong>{patient.fullName}</strong>
          <span>{dayjs().format('dddd, D MMM YYYY')}</span>
        </div>
        <Tooltip title="Read it aloud">
          <Button
            type="text"
            size="small"
            className="dash-dock-icon-btn"
            aria-label="Read the patient summary aloud"
            icon={<Volume2 size={15} />}
            onClick={() => narrative && speak(narrative.text)}
          />
        </Tooltip>
        <Tooltip title="Close">
          <Button type="text" size="small" className="dash-dock-icon-btn" aria-label="Close the patient summary panel" icon={<X size={16} />} onClick={close} />
        </Tooltip>
      </header>

      <div className="dash-dock-body">
        <section className="dash-dock-patient">
          <Avatar name={patient.fullName} size={38} />
          <div>
            <strong>{patient.fullName}</strong>
            <span className="muted">
              {patient.age} yrs · {patient.gender} · MRN {patient.mrn}
            </span>
            <span className="muted">{patient.primaryProviderName}</span>
          </div>
        </section>

        <section className="dash-dock-stats" aria-label="Key numbers">
          {stats.map((s) => (
            <button key={s.label} type="button" className={`dash-dock-stat is-${s.tone}`} onClick={() => navigate(s.path)}>
              <span className="dash-dock-stat-value">{loading ? '—' : s.value}</span>
              <span className="dash-dock-stat-label">{s.label}</span>
              <span className="dash-dock-stat-hint">{s.hint}</span>
            </button>
          ))}
        </section>

        <section className="dash-dock-section">
          <h3>
            <TriangleAlert size={13} aria-hidden /> Needs attention
          </h3>
          {highlights.nextAppointment && (
            <div className="dash-dock-row is-info">
              <CalendarDays size={14} aria-hidden />
              <div>
                <strong>{highlights.nextAppointment.type}</strong>
                <span className="muted">
                  {formatDate(highlights.nextAppointment.date)} at {formatTime(highlights.nextAppointment.startTime)} · {highlights.nextAppointment.providerName}
                </span>
              </div>
            </div>
          )}
          {overdueTasks.slice(0, 4).map((t) => (
            <div key={t.id} className="dash-dock-row is-danger">
              <ListChecks size={14} aria-hidden />
              <div>
                <strong>{t.title}</strong> <Tag color="red">Overdue</Tag>
                <span className="muted">Due {formatDate(t.dueDate)} · {t.assignedTo}</span>
              </div>
            </div>
          ))}
          {dueRecalls.slice(0, 4).map((r) => (
            <div key={r.id} className="dash-dock-row is-warning">
              <Repeat size={14} aria-hidden />
              <div>
                <strong>{r.reason}</strong> <Tag color="gold">{r.type}</Tag>
                <span className="muted">Due {formatDate(r.dueDate)}</span>
              </div>
            </div>
          ))}
          {!highlights.nextAppointment && !overdueTasks.length && !dueRecalls.length && <InlineEmpty>Nothing is overdue and no visit is booked.</InlineEmpty>}
        </section>

        <section className="dash-dock-section">
          <h3>
            <Pill size={13} aria-hidden /> Current medications <span className="dash-dock-count">{activeMedications.length}</span>
          </h3>
          {activeMedications.length ? (
            <ul className="dash-dock-list">
              {activeMedications.slice(0, 6).map((m) => (
                <li key={m.id}>
                  <span>
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
          {activeMedications.length > 6 && <p className="dash-dock-more">And {activeMedications.length - 6} more.</p>}
        </section>

        <section className="dash-dock-section">
          <h3>
            <Stethoscope size={13} aria-hidden /> Active problem list <span className="dash-dock-count">{activeDiagnoses.length}</span>
          </h3>
          {activeDiagnoses.length ? (
            <ul className="dash-dock-list">
              {activeDiagnoses.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <span>
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
          {activeDiagnoses.length > 6 && <p className="dash-dock-more">And {activeDiagnoses.length - 6} more.</p>}
        </section>

        <section className="dash-dock-section">
          <h3>
            <CalendarDays size={13} aria-hidden /> Upcoming appointments <span className="dash-dock-count">{upcomingAppointments.length}</span>
          </h3>
          {upcomingAppointments.length ? (
            <ul className="dash-dock-list">
              {upcomingAppointments.slice(0, 4).map((a) => (
                <li key={a.id}>
                  <span>
                    <strong>{formatDate(a.date, 'D MMM')} · {formatTime(a.startTime)}</strong>
                    <span className="muted">{[a.type, a.providerName, a.reason].filter(Boolean).join(' · ')}</span>
                  </span>
                  <StatusTag status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty>No upcoming appointments.</InlineEmpty>
          )}
        </section>

        {narrative && (
          <section className="dash-dock-narrative">
            <h3>In words</h3>
            {narrative.sections.slice(1).map((s) => (
              <p key={s.title}>{s.body}</p>
            ))}
          </section>
        )}
      </div>

      <footer className="dash-dock-foot">
        <Button size="small" onClick={() => navigate(PageRegistry.get('summary')!.path)}>
          Open Summary
        </Button>
        <Button size="small" type="primary" onClick={close}>
          Close
        </Button>
      </footer>
    </aside>
  );
}
