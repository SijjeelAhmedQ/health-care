import { Button, Tabs } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common';
import { RecordIcon } from '@/components/common/recordIcons';
import { useSelectedPatient, usePatientOverview } from '@/hooks/usePatientData';
import { AiSummaryTab } from '@/components/summary/AiSummaryTab';
import { RecordTab } from '@/components/summary/RecordTab';
import { PageRegistry } from '@/registry/pageRegistry';
import { CarePlanRegistry } from '@/registry/carePlanRegistry';
import { CarePlanHost } from '@/components/forms/CarePlanModal';

/**
 * The Summary module — the selected patient's chart and the one place their
 * medications, diagnoses, tasks, recalls and appointments are managed, plus the
 * AI Summary for dictated notes.
 *
 * The tabs come from the page registry and each is a real route
 * (/summary/diagnosis …), so every tab has a URL of its own. The Care Plan
 * dialog lives here too: records of every kind added in one go.
 */
export default function SummaryPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const patient = useSelectedPatient();
  const { counts } = usePatientOverview();
  const tabs = PageRegistry.summaryTabs();
  const active = tabs.find((t) => t.tab === tab)?.tab ?? tabs[0].tab!;

  const items = tabs.map((t) => ({
    key: t.tab!,
    label: (
      <span className="summary-tab-label">
        {t.recordKind ? <RecordIcon kind={t.recordKind} /> : <Sparkles size={15} />} {t.title}
        {t.recordKind && <span className="summary-tab-count">{counts[t.recordKind]}</span>}
      </span>
    ),
    children: t.recordKind ? <RecordTab kind={t.recordKind} /> : <AiSummaryTab />,
  }));

  return (
    <div className="page page-fill">
      <PageHeader
        title="Summary"
        subtitle={patient ? `${patient.fullName}'s chart — every record in one place, plus the AI summary of anything you dictate.` : 'Select a patient to see their summary.'}
        actions={
          patient && (
            <Button icon={<ClipboardList size={15} />} onClick={() => CarePlanRegistry.get()?.open({ medication: [{}] })}>
              Care plan
            </Button>
          )
        }
      />
      <Tabs className="profile-tabs summary-tabs page-fill-grow" activeKey={active} onChange={(key) => navigate(`/summary/${key}`)} items={items} destroyInactiveTabPane />
      <CarePlanHost />
    </div>
  );
}
