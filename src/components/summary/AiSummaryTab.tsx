import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Tag, Tooltip, message } from 'antd';
import { Bot, CalendarPlus, ClipboardList, Eraser, ListChecks, Mic, MicOff, Pill, Repeat, Sparkles, Stethoscope, Wand2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { voiceActions } from '@/store/slices/voiceSlice';
import { useSelectedPatient, usePatientOverview } from '@/hooks/usePatientData';
import { getVoiceController, VoiceController } from '@/services/ai/voiceController';
import { RECORD_KINDS, type RecordKind } from '@/types/records';
import { buildPatientNarrative } from '@/services/records/patientNarrative';
import { FieldRegistry } from '@/registry/fieldRegistry';
import type { ExtractedItem, ExtractionResult, FieldValues } from '@/types/ai';
import { EmptyState, InlineEmpty, SectionCard } from '@/components/common';
import { RecordFormModal } from '@/components/forms/RecordForms';
import { AiSummaryRegistry } from '@/registry/aiSummaryRegistry';
import { CarePlanRegistry, type CarePlanItems } from '@/registry/carePlanRegistry';

const kindMeta: Record<RecordKind, { label: string; icon: React.ReactNode; addLabel: string }> = {
  medication: { label: 'Medication', icon: <Pill size={16} />, addLabel: 'Add medication' },
  diagnosis: { label: 'Diagnosis', icon: <Stethoscope size={16} />, addLabel: 'Add diagnosis' },
  task: { label: 'Task', icon: <ListChecks size={16} />, addLabel: 'Add task' },
  recall: { label: 'Recall', icon: <Repeat size={16} />, addLabel: 'Add recall' },
  appointment: { label: 'Appointment', icon: <CalendarPlus size={16} />, addLabel: 'Add appointment' },
};

const EXAMPLE =
  'Start the patient on metformin 500 mg twice daily for 30 days, add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks, and schedule a follow-up appointment next Tuesday at 3 pm.';

/**
 * AI Summary.
 *
 * The clinician dictates a note; Omi Med STT streams it into the transcript
 * below, and Qwen extracts the medications, diagnoses, tasks, recalls and
 * appointments it contains (through its record_note_findings tool). Extracted
 * items are proposals: each one opens the normal form, pre-filled, and is only
 * stored when the user saves it.
 */
export function AiSummaryTab() {
  const patient = useSelectedPatient();
  const overview = usePatientOverview();
  const micSupported = useAppSelector((s) => s.voice.micSupported);
  const interim = useAppSelector((s) => s.voice.interimTranscript);
  const [transcript, setTranscript] = useState('');
  const [dictating, setDictating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ kind: RecordKind; prefill: FieldValues; key: string } | null>(null);
  const dispatch = useAppDispatch();
  const handoff = useAppSelector((s) => s.voice.summaryHandoff);
  const stopRef = useRef<(() => void) | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  const clearSilence = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };

  // The microphone must never keep running once this tab is left.
  useEffect(
    () => () => {
      clearSilence();
      stopRef.current?.();
    },
    [],
  );

  const stopDictation = useCallback(() => {
    clearSilence();
    stopRef.current?.();
    stopRef.current = null;
    setDictating(false);
  }, []);

  const runExtraction = useCallback(
    async (source?: string) => {
      const text = (source ?? transcriptRef.current).trim();
      if (!text) {
        setError('Dictate or type a paragraph first.');
        return;
      }
      stopDictation();
      setExtracting(true);
      setError(null);
      try {
        const extraction = await getVoiceController().extractNote(text);
        setResult(extraction);
        setDismissed(new Set());
        const total = RECORD_KINDS.reduce((n, k) => n + extraction.items[k].length, 0);
        if (!total) setError('The AI did not find any medication, diagnosis, task, recall or appointment in that paragraph. Try being more specific.');
      } catch (e) {
        setError((e as Error).message || 'Extraction failed.');
      } finally {
        setExtracting(false);
      }
    },
    [stopDictation],
  );

  // After a 10 s pause the dictation is over: mic off and extract, as if "Extract with AI" was pressed.
  const armSilence = useCallback(() => {
    clearSilence();
    silenceRef.current = setTimeout(() => {
      silenceRef.current = null;
      if (transcriptRef.current.trim()) void runExtraction();
      else stopDictation();
    }, VoiceController.SILENCE_MS);
  }, [runExtraction, stopDictation]);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      stopDictation();
      return;
    }
    setError(null);
    stopRef.current = getVoiceController().startDictation({
      onText: (text) => {
        setTranscript((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${text}` : text));
        armSilence();
      },
      onInterim: (text) => {
        if (text) armSilence();
      },
    });
    setDictating(true);
    armSilence();
  }, [dictating, stopDictation, armSilence]);

  // A clinical paragraph dictated to the voice assistant lands here and is extracted straight away.
  const handledHandoff = useRef<string | null>(null);
  useEffect(() => {
    if (!handoff || handledHandoff.current === handoff.id) return;
    handledHandoff.current = handoff.id;
    dispatch(voiceActions.setSummaryHandoff(null));
    setTranscript(handoff.text);
    void runExtraction(handoff.text);
  }, [handoff, dispatch, runExtraction]);

  const narrative = useMemo(
    () =>
      patient
        ? buildPatientNarrative({
            patient,
            medications: overview.medications,
            diagnoses: overview.diagnoses,
            tasks: overview.tasks,
            recalls: overview.recalls,
            appointments: overview.appointments,
          })
        : null,
    [patient, overview],
  );

  const totalFound = result ? RECORD_KINDS.reduce((n, k) => n + result.items[k].length, 0) : 0;

  /** Every item still on screen, in one Care Plan dialog (a tab per kind, a tab per record). */
  const openCarePlan = () => {
    if (!result) return;
    const items: CarePlanItems = Object.fromEntries(RECORD_KINDS.map((kind) => [kind, result.items[kind].filter((_, i) => !dismissed.has(`${kind}-${i}`)).map((item) => item.fields)]));
    CarePlanRegistry.get()?.open(items);
  };

  // The assistant can open an extracted item ("add the medication from the summary") while this tab is on screen.
  const live = useRef({ result, dismissed, runExtraction });
  live.current = { result, dismissed, runExtraction };
  useEffect(() => {
    const onScreen = () => {
      const { result: r, dismissed: d } = live.current;
      if (!r) return [];
      return RECORD_KINDS.flatMap((kind) =>
        r.items[kind]
          .map((item, index) => ({ kind, index, item }))
          .filter(({ kind: k, index }) => !d.has(`${k}-${index}`))
          .map(({ kind: k, index, item }, i) => ({ kind: k, position: i + 1, index, fields: item.fields })),
      );
    };
    return AiSummaryRegistry.register({
      items: () => onScreen().map(({ kind, position, fields }) => ({ kind, position, fields })),
      add: (kind, position) => {
        const hit = onScreen().find((x) => x.kind === kind && x.position === position);
        if (!hit) return false;
        setPending({ kind, prefill: hit.fields, key: `${kind}-${hit.index}` });
        return true;
      },
      extract: (note) => {
        if (note) setTranscript(note);
        void live.current.runExtraction(note);
      },
    });
  }, []);

  const renderItem = (kind: RecordKind, item: ExtractedItem, index: number) => {
    const key = `${kind}-${index}`;
    if (dismissed.has(key)) return null;
    const def = FieldRegistry.getForm(kind)!;
    const chips = Object.entries(item.fields).map(([name, value]) => {
      const field = def.fields.find((f) => f.name === name);
      return { label: field?.label ?? name, value: String(value) };
    });
    return (
      <li key={key} className="extracted-item">
        <div className="extracted-item-fields">
          {chips.map((c) => (
            <span key={c.label} className="extracted-chip">
              <span className="extracted-chip-label">{c.label}</span>
              <span className="extracted-chip-value">{c.value}</span>
            </span>
          ))}
        </div>
        {item.quote && <div className="extracted-quote">“{item.quote}”</div>}
        <div className="extracted-item-actions">
          <Button type="primary" size="small" onClick={() => setPending({ kind, prefill: item.fields, key })}>
            {kindMeta[kind].addLabel}
          </Button>
          <Button size="small" type="text" onClick={() => setDismissed((prev) => new Set(prev).add(key))}>
            Dismiss
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="ai-summary">
      <SectionCard
        title="Dictate what happened"
        icon={<Mic size={16} />}
        description="Speak one paragraph covering medication, diagnosis, task, recall and appointment. The transcript below is exactly what the speech model heard — edit it if it misheard something."
        extra={
          <Tooltip title={micSupported ? (dictating ? 'Stop dictation' : 'Start dictation') : 'No microphone available — type instead'}>
            <Button type={dictating ? 'default' : 'primary'} danger={dictating} icon={dictating ? <MicOff size={15} /> : <Mic size={15} />} onClick={toggleDictation} disabled={!micSupported}>
              {dictating ? 'Stop dictation' : 'Dictate'}
            </Button>
          </Tooltip>
        }
      >
        <Input.TextArea
          value={dictating && interim ? `${transcript}${transcript ? ' ' : ''}${interim}` : transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={micSupported ? 'Press Dictate and speak — or type the paragraph here.' : 'Type the paragraph here.'}
          autoSize={{ minRows: 4, maxRows: 10 }}
          className={dictating ? 'is-dictating' : undefined}
          aria-label="Dictated paragraph"
        />
        {dictating && (
          <div className="dictation-status" role="status">
            <span className="voice-waveform"><span /><span /><span /><span /><span /></span>
            Listening — keep talking. Pause for 10 seconds (or press <strong>Stop dictation</strong>) and the AI extracts it automatically.
          </div>
        )}
        <div className="ai-summary-actions">
          <Button type="primary" icon={<Wand2 size={15} />} loading={extracting} onClick={() => void runExtraction()} disabled={!transcript.trim()}>
            Extract with AI
          </Button>
          <Button
            icon={<Eraser size={15} />}
            onClick={() => {
              setTranscript('');
              setResult(null);
              setError(null);
            }}
            disabled={!transcript && !result}
          >
            Clear
          </Button>
          {!transcript && !result && (
            <Button type="link" size="small" onClick={() => setTranscript(EXAMPLE)}>
              Use an example paragraph
            </Button>
          )}
        </div>
        {error && <Alert type="warning" showIcon message={error} style={{ marginTop: 12 }} closable onClose={() => setError(null)} />}
      </SectionCard>

      <SectionCard
        title="AI extracted information"
        icon={<Sparkles size={16} />}
        description="What the model understood from the paragraph. Nothing is saved until you add it — every item opens the normal form so you can check it first."
        extra={result && <Tag color="blue">{result.provider}</Tag>}
      >
        {!result ? (
          <EmptyState
            title="Nothing extracted yet"
            description="Dictate or type a paragraph above, then press “Extract with AI”."
            icon={<Bot size={40} strokeWidth={1.4} />}
          />
        ) : (
          <>
            <div className="extracted-transcript">
              <div className="extracted-transcript-label">What you said</div>
              <p>“{result.transcript}”</p>
            </div>

            {result.questions.length > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="The AI needs clarification"
                description={
                  <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                    {result.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <div className="extracted-grid">
              {RECORD_KINDS.map((kind) => {
                const items = result.items[kind];
                const visible = items.map((item, i) => renderItem(kind, item, i)).filter(Boolean);
                return (
                  <div key={kind} className="extracted-group">
                    <div className="extracted-group-head">
                      {kindMeta[kind].icon}
                      <span>{kindMeta[kind].label}</span>
                      <span className="extracted-group-count">{visible.length}</span>
                    </div>
                    {visible.length ? <ul className="extracted-list">{visible}</ul> : <InlineEmpty>Nothing about {kindMeta[kind].label.toLowerCase()} in this paragraph.</InlineEmpty>}
                  </div>
                );
              })}
            </div>

            {totalFound > 0 && (
              <div className="ai-summary-footnote">
                <p className="muted">
                  {totalFound} item{totalFound === 1 ? '' : 's'} extracted for {patient?.fullName ?? 'this patient'}. The AI only proposes — review each one before saving.
                </p>
                <Button type="primary" icon={<ClipboardList size={15} />} onClick={openCarePlan} disabled={!patient}>
                  Review all in care plan
                </Button>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {narrative && (
        <SectionCard
          title="Patient overview"
          icon={<Bot size={16} />}
          description="Built only from records that exist for this patient — no generated clinical content."
        >
          <dl className="narrative">
            {narrative.sections.map((s) => (
              <div key={s.title}>
                <dt>{s.title}</dt>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      {pending && (
        <RecordFormModal
          key={pending.key}
          kind={pending.kind}
          open
          onOpen={() => undefined}
          onClose={() => setPending(null)}
          prefill={pending.prefill}
          onSaved={() => {
            message.success(`${kindMeta[pending.kind].label} saved for ${patient?.fullName ?? 'the patient'}`);
            setDismissed((prev) => new Set(prev).add(pending.key));
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
