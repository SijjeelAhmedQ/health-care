import { useEffect, useState } from 'react';
import { Button, Form, Radio, Select } from 'antd';
import { Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { AppModal } from '@/components/common/AppModal';
import { getVoiceController } from '@/services/ai/voiceController';
import { patientRef } from '@/services/records/patientRef';
import { RECORD_KINDS, type RecordKind } from '@/types/records';

export const MULTI_PATIENT_OVERLAY = 'multi-patient';

const labels: Record<RecordKind, string> = { medication: 'Medications', diagnosis: 'Diagnoses', task: 'Tasks', recall: 'Recalls', appointment: 'Appointments' };

/**
 * Records for several patients, by mouse — no patient needs to be selected first. Pick the kind and the
 * patients; the kind's form opens with a tab per patient. It runs the same runtime action as the
 * assistant's add_* tools with for_patients, so voice, typed requests and clicks all end in one form.
 */
export function MultiPatientLauncher() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => !!s.ui.overlays[MULTI_PATIENT_OVERLAY]);
  const patients = useAppSelector(patientSelectors.selectAll);
  const [kind, setKind] = useState<RecordKind>('appointment');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setChosen([]);
  }, [open]);

  const close = () => dispatch(uiActions.setOverlay({ id: MULTI_PATIENT_OVERLAY, open: false }));

  const start = async () => {
    setBusy(true);
    try {
      close();
      // One blank record per patient, each in its own patient tab — filled in by the provider.
      await getVoiceController().runAction((runtime) => runtime.createRecords(kind, [{}], chosen));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      title="Records for several patients"
      description="Choose what to add and for whom — no patient needs to be selected first. The form opens with a tab for each patient; nothing is saved until you save it."
      icon={<Users size={18} />}
      size="md"
      onClose={close}
      className="multi-patient-launcher"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!chosen.length} loading={busy} onClick={() => void start()}>
            Open form{chosen.length ? ` (${chosen.length} patient${chosen.length === 1 ? '' : 's'})` : ''}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Add">
          <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)} optionType="button" options={RECORD_KINDS.map((k) => ({ value: k, label: labels[k] }))} />
        </Form.Item>
        <Form.Item label="For patients" extra="Search by name or MRN; pick as many as you need.">
          <Select
            mode="multiple"
            showSearch
            allowClear
            className="multi-patient-select"
            placeholder="Search patients"
            value={chosen}
            onChange={setChosen}
            optionFilterProp="label"
            options={patients.map((p) => ({ value: patientRef(p), label: patientRef(p) }))}
          />
        </Form.Item>
      </Form>
    </AppModal>
  );
}
