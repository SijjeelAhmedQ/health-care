import { useState } from 'react';
import { Button, Checkbox, Dropdown, Tooltip, message } from 'antd';
import {
  Activity, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, FolderCheck, FolderOpen, ListChecks,
  Mail, MoreVertical, Pin, Repeat, ShieldOff, UserRoundCheck,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { setCurrentPatient } from '@/store/slices/patientSlice';
import { usePatientOverview } from '@/hooks/usePatientData';
import { buildPatientNarrative } from '@/services/records/patientNarrative';
import { categoryMeta, type InboxItem } from '@/services/inbox/inboxModel';
import type { Patient } from '@/types/domain';
import { AppModal } from '@/components/common/AppModal';
import { EmptyState } from '@/components/common';
import { RecordFormModal, type RecordKind } from '@/components/forms/RecordForms';

interface Props {
  item?: InboxItem;
  patient?: Patient;
  filed: boolean;
  onToggleFiled: (item: InboxItem) => void;
  /** Position within the filtered queue, for the footer counter. */
  position: { index: number; total: number };
  onPrevious: () => void;
  onNext: () => void;
  /** Per-item presentation flags, kept out of the clinical record. */
  flags: { portal: boolean; confidential: boolean; inactive: boolean };
  onToggleFlag: (flag: 'portal' | 'confidential' | 'inactive') => void;
  onBack?: () => void;
  showBack: boolean;
}

/**
 * The reading pane. The patient it belongs to is stated first, then the
 * document itself, then where it sits in the queue.
 */
export function InboxReadingPane({
  item,
  patient,
  filed,
  onToggleFiled,
  position,
  onPrevious,
  onNext,
  flags,
  onToggleFlag,
  onBack,
  showBack,
}: Props) {
  const dispatch = useAppDispatch();
  const overview = usePatientOverview();
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [followUp, setFollowUp] = useState<RecordKind | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  if (!item) {
    return (
      <div className="ibx-reading is-empty">
        <EmptyState
          title="Select an item to read it"
          description="Pick anything from the list to see the full report, who it belongs to, and the follow-up it suggests."
        />
      </div>
    );
  }

  const isCurrentPatient = !!patient && patient.id === currentPatientId;
  const meta = categoryMeta[item.category];
  const narrative =
    patient && isCurrentPatient
      ? buildPatientNarrative({
          patient,
          medications: overview.medications,
          diagnoses: overview.diagnoses,
          tasks: overview.tasks,
          recalls: overview.recalls,
          appointments: overview.appointments,
        })
      : null;

  const actionItems = [
    { key: 'task', icon: <ListChecks size={14} />, label: 'Create task', disabled: !isCurrentPatient },
    { key: 'recall', icon: <Repeat size={14} />, label: 'Create recall', disabled: !isCurrentPatient },
    { key: 'appointment', icon: <CalendarPlus size={14} />, label: 'Book appointment', disabled: !isCurrentPatient },
    { type: 'divider' as const },
    { key: 'summary', icon: <Activity size={14} />, label: 'Clinical summary', disabled: !narrative },
    { key: 'file', icon: filed ? <FolderOpen size={14} /> : <FolderCheck size={14} />, label: filed ? 'Unfile this item' : 'File this item' },
  ];

  const runAction = (key: string) => {
    if (key === 'summary') setSummaryOpen(true);
    else if (key === 'file') onToggleFiled(item);
    else setFollowUp(key as RecordKind);
  };

  return (
    <div className="ibx-reading">
      <header className="ibx-read-head">
        {showBack && (
          <Button type="text" size="small" icon={<ChevronLeft size={15} />} onClick={onBack} className="ibx-back">
            All items
          </Button>
        )}

        <div className="ibx-read-identity">
          <Pin size={14} className="ibx-read-pin" aria-hidden />
          <h2>{item.patientName}</h2>
          {patient && <span className="ibx-sex" title={patient.gender}>{patient.gender[0]}</span>}

          <div className="ibx-read-actions">
            <Tooltip title={isCurrentPatient ? 'This patient is the one you are working on' : `Work on ${item.patientName}`}>
              <Button
                size="small"
                icon={isCurrentPatient ? <UserRoundCheck size={14} /> : <ShieldOff size={14} />}
                disabled={isCurrentPatient || !item.patientId}
                onClick={() => {
                  dispatch(setCurrentPatient(item.patientId));
                  message.success(`${item.patientName} is now the selected patient`);
                }}
              >
                {isCurrentPatient ? 'Selected' : 'Select patient'}
              </Button>
            </Tooltip>
            <Button size="small" icon={<Activity size={14} />} disabled={!narrative} onClick={() => setSummaryOpen(true)}>
              Clinical Summary
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{ items: actionItems, onClick: ({ key }) => runAction(key) }}
              disabled={!isCurrentPatient && !narrative}
            >
              <Button size="small" icon={<MoreVertical size={14} />}>
                Actions <ChevronDown size={12} />
              </Button>
            </Dropdown>
            <Button size="small" icon={filed ? <FolderOpen size={14} /> : <FolderCheck size={14} />} onClick={() => onToggleFiled(item)}>
              {filed ? 'Unfile' : 'File'}
            </Button>
          </div>
        </div>

        {patient && (
          <p className="ibx-read-demographics">
            NHI: <b>{patient.mrn}</b> | DOB: {dayjs(patient.dateOfBirth).format('DD/MM/YYYY')} ({patient.age} Yrs) | {patient.language}
            <span className="ibx-read-contact">☎ {patient.phone}</span>
            <span className="ibx-read-contact">✉ {patient.email}</span>
          </p>
        )}

        <div className="ibx-read-flags">
          <Checkbox checked={flags.portal} onChange={() => onToggleFlag('portal')}>
            Do not show on Portal
          </Checkbox>
          <Checkbox checked={flags.confidential} onChange={() => onToggleFlag('confidential')}>
            Confidential
          </Checkbox>
          <Checkbox checked={flags.inactive} onChange={() => onToggleFlag('inactive')}>
            Inactive
          </Checkbox>
          <Tooltip title="These flags belong to the inbox view and are not written to the clinical record.">
            <span className="ibx-flags-note">view flags</span>
          </Tooltip>
        </div>

        <span className="ibx-read-tag">{item.subject}</span>
      </header>

      <div className="ibx-read-body">
        <section className="ibx-panel">
          <div className="ibx-panel-head">
            <span>DIAGNOSTIC COMMENTS</span>
            <button type="button" className="ibx-panel-toggle" onClick={() => setCommentsOpen((v) => !v)} aria-expanded={commentsOpen}>
              {commentsOpen ? 'Hide' : 'Show'} <ChevronDown size={12} className={commentsOpen ? 'is-open' : ''} />
            </button>
          </div>
          {commentsOpen && (
            <div className="ibx-panel-box">
              {item.preview}
              {item.attentionReason && <strong> {item.attentionReason}.</strong>}
            </div>
          )}
        </section>

        <p className="ibx-result-status">
          RESULT STATUS: <b>{item.status}</b> · {meta.dateLabel} {dayjs(item.receivedAt).format('DD/MM/YYYY')} · {meta.fromLabel}: {item.from}
        </p>

        <table className="ibx-result-table">
          <thead>
            <tr>
              <th scope="col">TEST</th>
              <th scope="col">CURRENT ({dayjs(item.receivedAt).format('DD/MM/YYYY')})</th>
              <th scope="col">PREVIOUS</th>
              <th scope="col">STATUS</th>
              <th scope="col">TREND</th>
            </tr>
          </thead>
          <tbody>
            {item.result ? (
              <tr>
                <th scope="row">
                  {item.result.test}
                  {item.result.referenceRange && <span className="ibx-ref">{item.result.referenceRange}</span>}
                </th>
                <td className={`ibx-value ${item.result.abnormal ? 'is-abnormal' : ''}`}>{item.result.value}</td>
                <td>—</td>
                <td>
                  <span className={`ibx-pill ${item.result.abnormal ? 'is-high' : 'is-normal'}`}>{item.result.abnormal ? 'ABNORMAL' : 'NORMAL'}</span>
                </td>
                <td>—</td>
              </tr>
            ) : (
              <tr>
                <th scope="row">{item.subject}</th>
                <td className="ibx-report" colSpan={4}>
                  {item.body ?? item.preview}
                </td>
              </tr>
            )}
            {item.result?.notes && (
              <tr className="ibx-note-row">
                <td colSpan={5}>{item.result.notes}</td>
              </tr>
            )}
          </tbody>
        </table>

        <dl className="ibx-meta">
          {item.meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <footer className="ibx-read-foot">
        <span className={`ibx-cat-tag is-${item.category}`}>{meta.label.toUpperCase()}</span>
        <span className="ibx-foot-subject">{item.subject}</span>
        <span className="ibx-foot-count">
          {position.index} / {position.total}
        </span>
        <Button size="small" icon={<ChevronLeft size={13} />} onClick={onPrevious} disabled={position.index <= 1}>
          Previous
        </Button>
        <Button size="small" onClick={onNext} disabled={position.index >= position.total}>
          Next <ChevronRight size={13} />
        </Button>
      </footer>

      {followUp && (
        <RecordFormModal
          key={`${item.id}-${followUp}`}
          kind={followUp}
          open
          onOpen={() => undefined}
          onClose={() => setFollowUp(null)}
          prefill={
            followUp === 'task'
              ? { title: `Review ${item.subject}`, category: item.category === 'referral' ? 'Referral' : 'Lab Follow-up' }
              : followUp === 'recall'
                ? { reason: `Follow up ${item.subject}`, type: item.category === 'lab' ? 'Lab Test' : 'Follow-up' }
                : { reason: `Discuss ${item.subject}`, type: 'Follow-up' }
          }
          onSaved={() => {
            message.success(`Saved for ${item.patientName}`);
            setFollowUp(null);
          }}
        />
      )}

      {summaryOpen && narrative && (
        <AppModal
          open
          title="Clinical summary"
          description={`Built from ${item.patientName}'s own records — no generated clinical content.`}
          icon={<Activity size={18} />}
          size="lg"
          onClose={() => setSummaryOpen(false)}
          footer={
            <Button
              type="primary"
              icon={<Mail size={14} />}
              onClick={() => {
                void navigator.clipboard?.writeText(narrative.text);
                message.success('Summary copied');
              }}
            >
              Copy summary
            </Button>
          }
        >
          <dl className="narrative">
            {narrative.sections.map((s) => (
              <div key={s.title}>
                <dt>{s.title}</dt>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
        </AppModal>
      )}
    </div>
  );
}
