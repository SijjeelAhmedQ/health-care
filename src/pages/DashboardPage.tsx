import { Button, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarDays, Inbox, ListChecks, PanelRight, Repeat, TriangleAlert, Users } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { setCurrentPatient } from '@/store/slices/patientSlice';
import { useProviderWorkload } from '@/hooks/useProviderData';
import { BarsChart, DonutChart } from '@/components/charts';
import { EmptyState, InlineEmpty, MetricCard, MetricGrid, PageHeader, SectionCard, StatusTag } from '@/components/common';
import { PageRegistry } from '@/registry/pageRegistry';
import { formatDate, formatTime } from '@/utils/format';
import type { RecordKind } from '@/types/records';

const greeting = () => {
  const h = dayjs().hour();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
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
  const remainingToday = today.filter((a) => !['Completed', 'Cancelled', 'No Show'].includes(a.status)).length;

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}, ${provider.fullName}`}
        subtitle={`${provider.specialty} · ${provider.locationName} · ${dayjs().format('dddd, D MMMM YYYY')}`}
        actions={
          <Button icon={<PanelRight size={15} />} type={panelOpen ? 'primary' : 'default'} aria-pressed={panelOpen} onClick={() => dispatch(uiActions.setDashboardPanelOpen(!panelOpen))}>
            Summary
          </Button>
        }
      />

      <MetricGrid>
        <MetricCard
          label="Today's appointments"
          value={today.length}
          icon={<CalendarDays size={18} />}
          tone="primary"
          hint={nextToday ? `Next: ${formatTime(nextToday.startTime)} · ${nextToday.patientName}` : remainingToday ? `${remainingToday} still to see` : 'Nothing left today'}
          loading={loading}
        />
        <MetricCard label="Next 7 days" value={upcoming.length} icon={<CalendarClock size={18} />} tone="info" hint="Booked appointments after today" loading={loading} />
        <MetricCard
          label="My open tasks"
          value={openTasks.length}
          icon={<ListChecks size={18} />}
          tone={overdueTasks.length ? 'error' : 'success'}
          hint={overdueTasks.length ? `${overdueTasks.length} overdue` : 'Nothing overdue'}
          loading={loading}
        />
        <MetricCard
          label="Recalls due"
          value={dueRecalls.length}
          icon={<Repeat size={18} />}
          tone={overdueRecalls.length ? 'warning' : 'neutral'}
          hint={overdueRecalls.length ? `${overdueRecalls.length} past their due date` : `For your ${panel.length} patients`}
          loading={loading}
        />
        <MetricCard
          label="Unfiled Inbox"
          value={unfiledInbox.length}
          icon={<Inbox size={18} />}
          tone={unfiledInbox.some((i) => i.attention) ? 'warning' : 'neutral'}
          hint={`${unfiledInbox.filter((i) => i.attention).length} need attention`}
          onClick={() => navigate('/inbox/all')}
          loading={loading}
        />
        <MetricCard label="My patients" value={panel.length} icon={<Users size={18} />} tone="neutral" hint="Patients with you as primary provider" onClick={() => navigate('/patients')} loading={loading} />
      </MetricGrid>

      <div className="dashboard-grid">
        <SectionCard title="Today's schedule" icon={<CalendarDays size={16} />} count={today.length} description={dayjs().format('dddd, D MMMM')}>
          {today.length ? (
            <ul className="mini-list">
              {today.map((a) => (
                <li key={a.id} className={nextToday?.id === a.id ? 'is-next' : undefined}>
                  <span className="mini-list-main">
                    <strong>
                      {formatTime(a.startTime)} · {a.patientName}
                    </strong>
                    <span className="muted">{[a.type, a.reason, `${a.durationMinutes} min`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <StatusTag status={a.status} />
                  <Button type="link" size="small" onClick={() => openPatient(a.patientId, 'appointment')}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty>No appointments booked with you today.</InlineEmpty>
          )}
        </SectionCard>

        <SectionCard title="Coming up" icon={<CalendarClock size={16} />} count={upcoming.length} description="The next seven days.">
          {upcoming.length ? (
            <ul className="mini-list">
              {upcoming.slice(0, 8).map((a) => (
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
          ) : (
            <InlineEmpty>Nothing booked in the next seven days.</InlineEmpty>
          )}
        </SectionCard>

        <SectionCard title="Needs your attention" icon={<TriangleAlert size={16} />} description="Your overdue tasks, recalls past due and Inbox items flagged for review.">
          {overdueTasks.slice(0, 4).map((t) => (
            <div key={t.id} className="attention-row is-danger">
              <ListChecks size={15} aria-hidden />
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
              <Repeat size={15} aria-hidden />
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
          {unfiledInbox
            .filter((i) => i.attention)
            .slice(0, 4)
            .map((i) => (
              <div key={i.id} className="attention-row is-info">
                <Inbox size={15} aria-hidden />
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
          {!overdueTasks.length && !overdueRecalls.length && !unfiledInbox.some((i) => i.attention) && <InlineEmpty>Nothing is overdue or flagged.</InlineEmpty>}
        </SectionCard>

        <SectionCard title="My open tasks" icon={<ListChecks size={16} />} count={openTasks.length}>
          {openTasks.length ? (
            <ul className="mini-list">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
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
              ))}
            </ul>
          ) : (
            <InlineEmpty>No open tasks assigned to you.</InlineEmpty>
          )}
        </SectionCard>
      </div>

      <div className="dashboard-grid charts">
        <SectionCard title="Booked appointments, next 14 days" icon={<CalendarDays size={16} />} className="span-2">
          <BarsChart data={dailyLoad} xKey="day" series={[{ key: 'booked', label: 'Appointments' }]} height={220} />
        </SectionCard>
        {todayByStatus.length > 0 && (
          <SectionCard title="Today by status" icon={<CalendarDays size={16} />}>
            <DonutChart data={todayByStatus} height={200} />
          </SectionCard>
        )}
        {upcomingByType.length > 0 && (
          <SectionCard title="Visit types, next 30 days" icon={<CalendarClock size={16} />}>
            <DonutChart data={upcomingByType} height={200} />
          </SectionCard>
        )}
      </div>
    </div>
  );
}
