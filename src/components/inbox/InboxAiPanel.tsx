import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, message } from 'antd';
import { Check, FileText, Sparkles, Star, X } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch } from '@/store';
import { recordSlices } from '@/store/slices/recordSlices';
import { usePatientOverview } from '@/hooks/usePatientData';
import { buildPatientNarrative } from '@/services/records/patientNarrative';
import { buildResultSummary, buildSuggestions, type InboxSuggestion } from '@/services/inbox/inboxInsights';
import { formValuesToRecord, RecordFormModal, type RecordKind } from '@/components/forms/RecordForms';
import type { InboxItem } from '@/services/inbox/inboxModel';
import type { Patient } from '@/types/domain';
import { RECALL_TYPE_OPTIONS, TASK_CATEGORY_OPTIONS } from '@/registry/fieldRegistry';

interface Props {
  item?: InboxItem;
  patient?: Patient;
  /** Only the patient being worked on can have records written to them. */
  isCurrentPatient: boolean;
  unfiledCount: number;
}

/**
 * The assistant column: what this patient looks like, what this result says,
 * and the follow-up the record points to.
 *
 * Every suggestion is editable before it is created, carries the reason it was
 * offered, and can be opened in the full form instead. Nothing is written until
 * the user presses Create or saves the form.
 */
export function InboxAiPanel({ item, patient, isCurrentPatient, unfiledCount }: Props) {
  const dispatch = useAppDispatch();
  const overview = usePatientOverview();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fullForm, setFullForm] = useState<{ kind: RecordKind; prefill: Record<string, string | number | boolean> } | null>(null);
  const [quick, setQuick] = useState<Record<string, string>>({});

  const suggestions = useMemo(() => (item ? buildSuggestions(item) : []), [item]);

  // A new item is a new set of suggestions.
  useEffect(() => {
    setEditing(null);
    setDrafts({});
    setQuick({});
  }, [item?.id]);

  const narrative = useMemo(
    () =>
      patient && isCurrentPatient
        ? buildPatientNarrative({
            patient,
            medications: overview.medications,
            diagnoses: overview.diagnoses,
            tasks: overview.tasks,
            recalls: overview.recalls,
            appointments: overview.appointments,
          })
        : null,
    [patient, isCurrentPatient, overview],
  );

  if (!item) {
    return (
      <aside className="ibx-ai" aria-label="Assistant">
        <p className="ibx-ai-idle">Open an item to see its summary and the follow-up it suggests.</p>
      </aside>
    );
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.id));

  const create = async (suggestion: InboxSuggestion) => {
    if (!patient) return;
    if (suggestion.kind === 'email') {
      void navigator.clipboard?.writeText(drafts[suggestion.id] ?? suggestion.text);
      message.success('Draft copied — nothing was sent');
      setEditing(null);
      return;
    }
    const kind = suggestion.kind as RecordKind;
    const values: Record<string, unknown> = { ...suggestion.prefill };
    // Whatever the user typed in the quick editor wins over the suggestion.
    if (quick[`${suggestion.id}:primary`]) {
      values[kind === 'diagnosis' ? 'description' : kind === 'recall' ? 'reason' : 'title'] = quick[`${suggestion.id}:primary`];
    }
    if (quick[`${suggestion.id}:date`]) values[kind === 'recall' ? 'dueDate' : 'dueDate'] = quick[`${suggestion.id}:date`];
    if (quick[`${suggestion.id}:extra`]) values[kind === 'diagnosis' ? 'notes' : kind === 'recall' ? 'notes' : 'description'] = quick[`${suggestion.id}:extra`];
    if (quick[`${suggestion.id}:select`]) values[kind === 'recall' ? 'type' : 'category'] = quick[`${suggestion.id}:select`];
    if (drafts[suggestion.id]) {
      values[kind === 'diagnosis' ? 'notes' : kind === 'recall' ? 'notes' : 'description'] = drafts[suggestion.id];
    }

    const payload = formValuesToRecord(kind, values, {
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      authorName: patient.primaryProviderName,
    });
    // Every record slice has the same shape; one concrete type keeps the dispatch monomorphic.
    const slice = recordSlices[kind] as (typeof recordSlices)['medication'];
    await dispatch(slice.create(payload as never)).unwrap();
    message.success(`${suggestion.actionLabel.replace('Add ', '')} created for ${patient.fullName}`);
    setDismissed((prev) => new Set(prev).add(suggestion.id));
    setEditing(null);
  };

  const quickFields = (suggestion: InboxSuggestion) => {
    const primaryKey = `${suggestion.id}:primary`;
    const primaryValue =
      quick[primaryKey] ??
      String(suggestion.prefill.description ?? suggestion.prefill.reason ?? suggestion.prefill.title ?? '');
    const dateKey = `${suggestion.id}:date`;
    const dateValue = quick[dateKey] ?? String(suggestion.prefill.dueDate ?? '');
    const selectKey = `${suggestion.id}:select`;

    switch (suggestion.kind) {
      case 'diagnosis':
        return (
          <>
            <label className="ibx-q-label" htmlFor={primaryKey}>DIAGNOSIS NAME</label>
            <Input id={primaryKey} value={primaryValue} onChange={(e) => setQuick((p) => ({ ...p, [primaryKey]: e.target.value }))} />
            <label className="ibx-q-label" htmlFor={`${suggestion.id}:extra`}>DETAILS</label>
            <Input.TextArea
              id={`${suggestion.id}:extra`}
              autoSize={{ minRows: 3, maxRows: 6 }}
              value={quick[`${suggestion.id}:extra`] ?? String(suggestion.prefill.notes ?? '')}
              onChange={(e) => setQuick((p) => ({ ...p, [`${suggestion.id}:extra`]: e.target.value }))}
            />
          </>
        );
      case 'recall':
        return (
          <>
            <label className="ibx-q-label" htmlFor={primaryKey}>RECALL REASON</label>
            <Input id={primaryKey} value={primaryValue} onChange={(e) => setQuick((p) => ({ ...p, [primaryKey]: e.target.value }))} />
            <label className="ibx-q-label" htmlFor={selectKey}>RECALL GROUP</label>
            <Select
              id={selectKey}
              className="ibx-q-select"
              value={quick[selectKey] ?? String(suggestion.prefill.type ?? 'Follow-up')}
              onChange={(v) => setQuick((p) => ({ ...p, [selectKey]: v }))}
              options={RECALL_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
            <label className="ibx-q-label" htmlFor={dateKey}>RECALL DATE</label>
            <DatePicker
              id={dateKey}
              className="ibx-q-select"
              value={dateValue ? dayjs(dateValue) : undefined}
              format="DD/MM/YYYY"
              onChange={(d) => setQuick((p) => ({ ...p, [dateKey]: d ? d.format('YYYY-MM-DD') : '' }))}
            />
          </>
        );
      case 'task':
        return (
          <>
            <label className="ibx-q-label" htmlFor={primaryKey}>TASK</label>
            <Input id={primaryKey} value={primaryValue} onChange={(e) => setQuick((p) => ({ ...p, [primaryKey]: e.target.value }))} />
            <label className="ibx-q-label" htmlFor={selectKey}>CATEGORY</label>
            <Select
              id={selectKey}
              className="ibx-q-select"
              value={quick[selectKey] ?? String(suggestion.prefill.category ?? 'Follow-up')}
              onChange={(v) => setQuick((p) => ({ ...p, [selectKey]: v }))}
              options={TASK_CATEGORY_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
            <label className="ibx-q-label" htmlFor={dateKey}>DUE DATE</label>
            <DatePicker
              id={dateKey}
              className="ibx-q-select"
              value={dateValue ? dayjs(dateValue) : undefined}
              format="DD/MM/YYYY"
              onChange={(d) => setQuick((p) => ({ ...p, [dateKey]: d ? d.format('YYYY-MM-DD') : '' }))}
            />
          </>
        );
      case 'email':
        return (
          <>
            <label className="ibx-q-label" htmlFor={`${suggestion.id}:extra`}>MESSAGE</label>
            <Input.TextArea
              id={`${suggestion.id}:extra`}
              autoSize={{ minRows: 5, maxRows: 10 }}
              value={drafts[suggestion.id] ?? suggestion.text}
              onChange={(e) => setDrafts((p) => ({ ...p, [suggestion.id]: e.target.value }))}
            />
          </>
        );
    }
  };

  return (
    <aside className="ibx-ai" aria-label="Assistant">
      {narrative && (
        <section className="ibx-ai-card is-patient">
          <h3>
            Patient Summary <span>· {dayjs().format('DD/MM/YYYY')}</span>
          </h3>
          <p>{narrative.sections.slice(1, 4).map((s) => s.body).join(' ')}</p>
        </section>
      )}

      <section className="ibx-ai-card is-result">
        <h3>
          <Sparkles size={13} aria-hidden /> Result Summary <span>· {dayjs(item.receivedAt).format('DD/MM/YYYY')}</span>
        </h3>
        <p>{buildResultSummary(item)}</p>
      </section>

      <div className="ibx-ai-actions-head">
        <Star size={14} aria-hidden />
        <span>Suggested actions {unfiledCount > 0 && `(covers ${unfiledCount} unfiled item${unfiledCount === 1 ? '' : 's'})`}</span>
        <span className="ibx-ai-count">{visible.length}</span>
      </div>

      {!isCurrentPatient && (
        <p className="ibx-ai-gate">
          Select {item.patientName} to act on these suggestions — records are always written against the patient you are working on.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="ibx-ai-idle">Nothing outstanding on this item.</p>
      ) : (
        visible.map((suggestion) => {
          const isEditing = editing === suggestion.id;
          return (
            <section key={suggestion.id} className={`ibx-sugg ${isEditing ? 'is-editing' : ''}`}>
              <div className="ibx-sugg-head">
                <span className="ibx-sugg-label">{suggestion.label}</span>
                {isEditing ? (
                  <button type="button" className="ibx-sugg-done" onClick={() => setEditing(null)}>
                    Done
                  </button>
                ) : (
                  <span className="ibx-sugg-buttons">
                    <Button size="small" danger icon={<X size={12} />} onClick={() => setDismissed((p) => new Set(p).add(suggestion.id))}>
                      Dismiss
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={suggestion.kind !== 'email' && !isCurrentPatient}
                      onClick={() => setEditing(suggestion.id)}
                    >
                      {suggestion.actionLabel}
                    </Button>
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="ibx-quick">
                  <span className="ibx-quick-title">QUICK EDIT</span>
                  {quickFields(suggestion)}
                  <p className="ibx-sugg-basis">{suggestion.basis}</p>
                  <div className="ibx-quick-actions">
                    <Button size="small" danger icon={<X size={12} />} onClick={() => setDismissed((p) => new Set(p).add(suggestion.id))}>
                      Dismiss
                    </Button>
                    <Button size="small" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    {suggestion.kind !== 'email' && (
                      <Button
                        size="small"
                        icon={<FileText size={12} />}
                        onClick={() =>
                          setFullForm({
                            kind: suggestion.kind as RecordKind,
                            prefill: suggestion.prefill as Record<string, string | number | boolean>,
                          })
                        }
                      >
                        Full form
                      </Button>
                    )}
                    <Button size="small" type="primary" icon={<Check size={12} />} onClick={() => void create(suggestion)}>
                      {suggestion.kind === 'email' ? 'Copy' : 'Create'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="ibx-sugg-body">
                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={drafts[suggestion.id] ?? suggestion.text}
                    onChange={(e) => setDrafts((p) => ({ ...p, [suggestion.id]: e.target.value }))}
                    aria-label={`${suggestion.label} suggestion`}
                  />
                </div>
              )}
            </section>
          );
        })
      )}

      {fullForm && (
        <RecordFormModal
          kind={fullForm.kind}
          open
          onOpen={() => undefined}
          onClose={() => setFullForm(null)}
          prefill={fullForm.prefill}
          onSaved={() => {
            message.success('Saved');
            setFullForm(null);
          }}
        />
      )}
    </aside>
  );
}
