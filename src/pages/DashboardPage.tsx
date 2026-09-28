import { Button, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, CalendarDays, ChartColumn, Clock3, Inbox, ListChecks, MapPin, PanelRight, ChartPie, Repeat, Sparkles, Stethoscope, TriangleAlert, Users } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { setCurrentPatient } from '@/store/slices/patientSlice';
import { useProviderWorkload } from '@/hooks/useProviderData';
import { aiConfig } from '@/services/ai/config';
import { BarsChart, DonutChart } from '@/components/charts';
import { Avatar, EmptyState, InlineEmpty, MetricCard, MetricGrid, PageHeader, SectionCard, StatusTag } from '@/components/common';
import { PageRegistry } from '@/registry/pageRegistry';
import { formatDate, formatTime } from '@/utils/format';
import type { RecordKind } from '@/types/records';
import type { Appointment } from '@/types/domain';

const greeting = () => {
  const h = dayjs().hour();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const CLOSED = ['Completed', 'Cancelled', 'No Show'];

/** The dot on the schedule's time rail: done, missed, happening, or still to come. */
const railTone = (status: string) =>
  status === 'Completed' ? 'is-done' : status === 'Cancelled' || status === 'No Show' ? 'is-missed' : status === 'Checked In' || status === 'In Progress' ? 'is-now' : 'is-todo';

/** "Today", "Tomorrow" or the weekday — the headings the Coming up list is grouped under. */
const dayHeading = (date: string) => {
  const d = dayjs(date).startOf('day');
  const diff = d.diff(dayjs().startOf('day'), 'day');
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.format('dddd');
};

/**
 * The signed-in provider's dashboard: their day, their week, and what is
 * waiting on them. Nothing here depends on a selected patient; opening a row
 * selects that patient and lands on the matching Summary tab.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { workload, loading } = useProviderWorkload();
  const panelOpen = useAppSelector((s) => s.ui.dashboardPanelOpen);

  const openPatient = (patientId: string, kind?: RecordKind) => {
    dispatch(setCurrentPatient(patientId));
    navigate(kind ? PageRegistry.recordTab(kind).path : PageRegistry.get('summary')!.path);
  };

  if (!workload) {
    return (
      <div className="page">
        <PageHeader title="Dashboard" subtitle="Your schedule and work queue." />
        <SectionCard>{loading ? <InlineEmpty>Loading your dashboard…</InlineEmpty> : <EmptyState title="No provider profile" description="This account is not linked to a provider record, so there is no schedule to show." />}</SectionCard>
      </div>
    );
  }

  const { provider, today, nextToday, upcoming, openTasks, overdueTasks, dueRecalls, overdueRecalls, unfiledInbox, panel, dailyLoad, todayByStatus, upcomingByType } = workload;
  const remainingToday = today.filter((a) => !CLOSED.includes(a.status)).length;
  const doneToday = today.filter((a) => a.status === 'Completed').length;
  const dayProgress = today.length ? Math.round((doneToday / today.length) * 100) : 0;
  const flaggedInbox = unfiledInbox.filter((i) => i.attention);
  const attentionCount = overdueTasks.length + overdueRecalls.length + flaggedInbox.length;

  // The next seven days, grouped under a heading per day.
  const comingUp = upcoming.slice(0, 8).reduce<Array<{ date: string; items: Appointment[] }>>((groups, a) => {
    const last = groups[groups.length - 1];
    if (last && last.date === a.date) last.items.push(a);
    else groups.push({ date: a.date, items: [a] });
    return groups;
  }, []);

  return (
    <div className="page dash">
      <section className="dash-hero" aria-label="Your day">
        <div className="dash-hero-main">
          <span className="dash-hero-date">
            <CalendarDays size={14} aria-hidden /> {dayjs().format('dddd, D MMMM YYYY')}
          </span>
          <h1 className="dash-hero-title">
            {greeting()}, <span>{provider.fullName}</span>
          </h1>
          <p className="dash-hero-sub sep-list">
            <span>
              <Stethoscope size={14} aria-hidden /> {provider.specialty}
            </span>
            <span>
              <MapPin size={14} aria-hidden /> {provider.locationName}
            </span>
          </p>
          <div className="dash-hero-actions">
            <Button
              size="large"
              className={`dash-hero-btn ${panelOpen ? 'is-on' : ''}`}
              icon={<PanelRight size={16} />}
              aria-pressed={panelOpen}
              onClick={() => dispatch(uiActions.setDashboardPanelOpen(!panelOpen))}
            >
              Summary
            </Button>
            {aiConfig.enableVoice && (
              <Button size="large" className="dash-hero-btn is-ghost" icon={<Sparkles size={16} />} onClick={() => dispatch(voiceActions.setPanelOpen(true))}>
                Ask the assistant
              </Button>
            )}
          </div>
        </div>

        <div className="dash-hero-side">
          <div className="dash-next">
            <div className="dash-next-label">
              <Clock3 size={13} aria-hidden /> {nextToday ? 'Up next' : 'Your day'}
            </div>
            {nextToday ? (
              <>
                <div className="dash-next-time">{formatTime(nextToday.startTime)}</div>
                <div className="dash-next-who">
                  <Avatar name={nextToday.patientName} size={34} color="#ffffff" />
                  <div>
                    <strong>{nextToday.patientName}</strong>
                    <span>{[nextToday.type, `${nextToday.durationMinutes} min`].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
                <button type="button" className="dash-next-open" onClick={() => openPatient(nextToday.patientId, 'appointment')}>
                  Open chart <ArrowRight size={14} aria-hidden />
                </button>
              </>
            ) : (
              <p className="dash-next-empty">{today.length ? 'Nothing left today — every appointment is done.' : 'No appointments booked with you today.'}</p>
            )}
          </div>
          <div className="dash-progress">
            <Progress
              type="circle"
              percent={dayProgress}
              size={64}
              strokeWidth={10}
              strokeColor="#ffffff"
              trailColor="rgba(255,255,255,0.22)"
              format={() => <span className="dash-progress-value">{doneToday}/{today.length}</span>}
            />
            <div>
              <strong>{remainingToday ? `${remainingToday} still to see` : 'All caught up'}</strong>
              <span>{doneToday} of {today.length} seen today</span>
            </div>
          </div>
        </div>
      </section>

      <MetricGrid>
        <MetricCard
          label="Today's appointments"
          value={today.length}
          icon={<CalendarDays size={19} />}
          tone="primary"
          hint={nextToday ? `Next: ${formatTime(nextToday.startTime)} · ${nextToday.patientName}` : remainingToday ? `${remainingToday} still to see` : 'Nothing left today'}
          loading={loading}
        />
        <MetricCard label="Next 7 days" value={upcoming.length} icon={<CalendarClock size={19} />} tone="info" hint="Booked appointments after today" loading={loading} />
        <MetricCard
          label="My open tasks"
          value={openTasks.length}
          icon={<ListChecks size={19} />}
          tone={overdueTasks.length ? 'error' : 'success'}
          hint={overdueTasks.length ? `${overdueTasks.length} overdue` : 'Nothing overdue'}
          loading={loading}
        />
        <MetricCard
          label="Recalls due"
          value={dueRecalls.length}
          icon={<Repeat size={19} />}
          tone={overdueRecalls.length ? 'warning' : 'neutral'}
          hint={overdueRecalls.length ? `${overdueRecalls.length} past their due date` : `For your ${panel.length} patients`}
          loading={loading}
        />
        <MetricCard
          label="Unfiled Inbox"
          value={unfiledInbox.length}
          icon={<Inbox size={19} />}
          tone={flaggedInbox.length ? 'warning' : 'neutral'}
          hint={`${flaggedInbox.length} need attention`}
          onClick={() => navigate('/inbox/all')}
          loading={loading}
        />
        <MetricCard label="My patients" value={panel.length} icon={<Users size={19} />} tone="neutral" hint="Patients with you as primary provider" onClick={() => navigate('/patients')} loading={loading} />
      </MetricGrid>

      <div className="card-grid dash-grid">
        <SectionCard className="col-7" title="Today's schedule" icon={<CalendarDays size={16} />} count={today.length} description={dayjs().format('dddd, D MMMM')}>
          {today.length ? (
            <ol className="dash-timeline">
              {today.map((a) => {
                const isNext = nextToday?.id === a.id;
                return (
                  <li key={a.id} className={`dash-timeline-item ${railTone(a.status)} ${isNext ? 'is-next' : ''}`}>
                    <span className="dash-timeline-time">{formatTime(a.startTime)}</span>
                    <span className="dash-timeline-rail" aria-hidden>
                      <span />
                    </span>
                    <div className="dash-timeline-card">
                      <Avatar name={a.patientName} size={36} />
                      <span className="dash-timeline-main">
                        <strong>
                          {a.patientName}
                          {isNext && <span className="dash-next-pill">Up next</span>}
                        </strong>
                        <span className="muted">{[a.type, a.reason, `${a.durationMinutes} min`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <StatusTag status={a.status} />
                      <Button size="small" className="dash-open-btn" onClick={() => openPatient(a.patientId, 'appointment')} aria-label={`Open ${a.patientName}`}>
                        Open
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="dash-empty">
              <span className="dash-empty-icon" aria-hidden>
                <CalendarDays size={24} />
              </span>
              <strong>A clear day</strong>
              <span className="muted">No appointments booked with you today.</span>
            </div>
          )}
        </SectionCard>

        <SectionCard
          className="col-5"
          title="Needs your attention"
          icon={<TriangleAlert size={16} />}
          count={attentionCount}
          description="Your overdue tasks, recalls past due and Inbox items flagged for review."
        >
          <div className="dash-attention">
            {overdueTasks.slice(0, 4).map((t) => (
              <div key={t.id} className="attention-row is-danger">
                <span className="attention-icon" aria-hidden>
                  <ListChecks size={15} />
                </span>
                <div>
                  <strong>{t.title}</strong> <Tag color="red">Overdue</Tag>
                  <div className="muted">
                    {t.patientName} · due {formatDate(t.dueDate)} · {t.priority}
                  </div>
                </div>
                <Button type="link" size="small" onClick={() => openPatient(t.patientId, 'task')}>
                  Open
                </Button>
              </div>
            ))}
            {overdueRecalls.slice(0, 4).map((r) => (
              <div key={r.id} className="attention-row is-warning">
                <span className="attention-icon" aria-hidden>
                  <Repeat size={15} />
                </span>
                <div>
                  <strong>{r.reason}</strong> <Tag color="gold">{r.type}</Tag>
                  <div className="muted">
                    {r.patientName} · due {formatDate(r.dueDate)}
                  </div>
                </div>
                <Button type="link" size="small" onClick={() => openPatient(r.patientId, 'recall')}>
                  Open
                </Button>
              </div>
            ))}
            {flaggedInbox.slice(0, 4).map((i) => (
              <div key={i.id} className="attention-row is-info">
                <span className="attention-icon" aria-hidden>
                  <Inbox size={15} />
                </span>
                <div>
                  <strong>{i.subject}</strong>
                  <div className="muted">
                    {i.patientName} · {i.attentionReason ?? i.status}
                  </div>
                </div>
                <Button type="link" size="small" onClick={() => navigate(`/inbox/${i.category}?patient=${encodeURIComponent(i.patientId)}`)}>
                  View
                </Button>
              </div>
            ))}
            {!attentionCount && (
              <div className="dash-allclear">
                <span className="dash-allclear-icon" aria-hidden>
                  <Sparkles size={20} />
                </span>
                <strong>All clear</strong>
                <span className="muted">Nothing is overdue or flagged.</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard className="col-6" title="Coming up" icon={<CalendarClock size={16} />} count={upcoming.length} description="The next seven days.">
          {upcoming.length ? (
            <div className="dash-upcoming">
              {comingUp.map((g) => (
                <div key={g.date} className="dash-upcoming-day">
                  {/* The date badge sits beside the day's appointments, not on a row of its own. */}
                  <span className="dash-date-badge">
                    <b>{dayjs(g.date).format('D')}</b>
                    <small>{dayjs(g.date).format('MMM')}</small>
                  </span>
                  <div className="dash-upcoming-body">
                    <div className="dash-upcoming-head">
                      <strong>{dayHeading(g.date)}</strong>
                      <span className="muted">
                        {' '}
                        · {g.items.length} appointment{g.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="mini-list">
                      {g.items.map((a) => (
                        <li key={a.id}>
                          <span className="mini-list-main">
                            <strong>{a.patientName}</strong>
                            <span className="muted">
                              {formatDate(a.date, 'ddd D MMM')} at {formatTime(a.startTime)} · {a.type}
                            </span>
                          </span>
                          <Button type="link" size="small" onClick={() => openPatient(a.patientId, 'appointment')}>
                            Open
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <InlineEmpty>Nothing booked in the next seven days.</InlineEmpty>
          )}
        </SectionCard>

        <SectionCard className="col-6" title="My open tasks" icon={<ListChecks size={16} />} count={openTasks.length}>
          {openTasks.length ? (
            <ul className="mini-list dash-tasks">
              {openTasks.slice(0, 6).map((t) => {
                const overdue = overdueTasks.some((o) => o.id === t.id);
                return (
                  <li key={t.id} className={overdue ? 'is-overdue-row' : undefined}>
                    <span className={`dash-task-mark ${overdue ? 'is-overdue' : ''}`} aria-hidden>
                      <ListChecks size={14} />
                    </span>
                    <span className="mini-list-main">
                      <strong>{t.title}</strong>
                      <span className="muted">
                        {t.patientName} · due {formatDate(t.dueDate)}
                      </span>
                    </span>
                    <StatusTag status={t.priority} />
                    <Button type="link" size="small" onClick={() => openPatient(t.patientId, 'task')}>
                      Open
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <InlineEmpty>No open tasks assigned to you.</InlineEmpty>
          )}
        </SectionCard>
      </div>

      <div className="card-grid dash-grid">
        <SectionCard className="col-12" title="Booked appointments, next 14 days" icon={<ChartColumn size={16} />}>
          <BarsChart data={dailyLoad} xKey="day" series={[{ key: 'booked', label: 'Appointments' }]} height={230} />
        </SectionCard>
        {todayByStatus.length > 0 && (
          <SectionCard className={upcomingByType.length > 0 ? 'col-6' : 'col-12'} title="Today by status" icon={<ChartPie size={16} />}>
            <DonutChart data={todayByStatus} height={190} />
          </SectionCard>
        )}
        {upcomingByType.length > 0 && (
          <SectionCard className={todayByStatus.length > 0 ? 'col-6' : 'col-12'} title="Visit types, next 30 days" icon={<ChartPie size={16} />}>
            <DonutChart data={upcomingByType} height={190} />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
