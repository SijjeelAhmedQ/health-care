import { Tabs } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ListChecks, Pill, Repeat, Sparkles, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/common';
import { useSelectedPatient, usePatientOverview } from '@/hooks/usePatientData';
import { AiSummaryTab } from '@/components/summary/AiSummaryTab';
import { SummaryRecordTab } from '@/components/summary/SummaryRecordTab';
import type { RecordKind } from '@/components/forms/RecordForms';

const TABS = ['ai-summary', 'medication', 'recall', 'appointment', 'diagnosis', 'task'] as const;
type SummaryTab = (typeof TABS)[number];

/**
 * The Summary module: the AI-driven overview plus one tab per record type, all
 * showing the selected patient's real data.
 *
 * Each tab is a real route (/summary/diagnosis …), so "show me the diagnosis
 * tab" by voice lands on a URL the user can also bookmark and share.
 */
export default function SummaryPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const patient = useSelectedPatient();
  const { counts } = usePatientOverview();

  const active: SummaryTab = TABS.includes(tab as SummaryTab) ? (tab as SummaryTab) : 'ai-summary';

  const items = [
    {
      key: 'ai-summary',
      label: (
        <span className="summary-tab-label">
          <Sparkles size={15} /> AI Summary
        </span>
      ),
      children: <AiSummaryTab />,
    },
    ...([
      ['medication', 'Medication', <Pill size={15} key="m" />, counts.medication],
      ['recall', 'Recall', <Repeat size={15} key="r" />, counts.recall],
      ['appointment', 'Appointment', <CalendarDays size={15} key="a" />, counts.appointment],
      ['diagnosis', 'Diagnosis', <Stethoscope size={15} key="d" />, counts.diagnosis],
      ['task', 'Task', <ListChecks size={15} key="t" />, counts.task],
    ] as Array<[RecordKind, string, React.ReactNode, number]>).map(([kind, label, icon, count]) => ({
      key: kind,
      label: (
        <span className="summary-tab-label">
          {icon} {label}
          <span className="summary-tab-count">{count}</span>
        </span>
      ),
      children: <SummaryRecordTab kind={kind} />,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Summary"
        subtitle={
          patient
            ? `Everything recorded for ${patient.fullName}, plus the AI summary of anything you dictate.`
            : 'Select a patient to see their summary.'
        }
      />
      <Tabs
        className="profile-tabs summary-tabs"
        activeKey={active}
        onChange={(key) => navigate(`/summary/${key}`)}
        items={items}
      />
    </>
  );
}
