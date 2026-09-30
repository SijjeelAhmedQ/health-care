import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Tooltip, message } from 'antd';
import { Pencil, Trash2 } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { recordSlices } from '@/store/slices/recordSlices';
import { usePatientOverview, useSelectedPatient } from '@/hooks/usePatientData';
import { RecordRegistry } from '@/registry/recordRegistry';
import { recordLabel, recordSummary } from '@/services/records/recordMapping';
import { confirmAction } from '@/components/common';
import { RecordFormModal, type RecordKind } from '@/components/forms/RecordForms';
import type { Appointment, Diagnosis, Medication, Recall, Task } from '@/types/domain';

export type RecordOf<K extends RecordKind> = K extends 'medication'
  ? Medication
  : K extends 'diagnosis'
    ? Diagnosis
    : K extends 'task'
      ? Task
      : K extends 'recall'
        ? Recall
        : Appointment;

/**
 * Add / edit / delete for one record kind, bound to the selected patient.
 *
 * Both the module page and the Summary tab use this, so a medication added from
 * the Summary behaves exactly like one added from the Medication module — same
 * dialog, same validation, same confirmation, same voice control.
 */
export function useRecordModule<K extends RecordKind>(kind: K, titleOverride?: string) {
  const dispatch = useAppDispatch();
  const patient = useSelectedPatient();
  const overview = usePatientOverview();
  const slice = recordSlices[kind];
  const title = titleOverride ?? kind.charAt(0).toUpperCase() + kind.slice(1);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordOf<K> | undefined>();

  const rows = useMemo(() => {
    const byKind = {
      medication: overview.medications,
      diagnosis: overview.diagnoses,
      task: overview.tasks,
      recall: overview.recalls,
      appointment: overview.appointments,
    };
    return byKind[kind] as RecordOf<K>[];
  }, [kind, overview]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const openCreate = useCallback(() => {
    setEditing(undefined);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((record: RecordOf<K>) => {
    setEditing(record);
    setFormOpen(true);
  }, []);

  /** Destructive: always states exactly what will go, and never runs on its own. */
  const remove = useCallback(
    (record: RecordOf<K>) => {
      const label = recordLabel(kind, record);
      confirmAction({
        title: `Delete this ${title.toLowerCase()}?`,
        danger: true,
        okText: 'Delete',
        content: (
          <div>
            <p style={{ marginTop: 0 }}>
              <strong>{label}</strong> will be permanently removed from {patient?.fullName ?? 'this patient'}&apos;s record. This cannot be undone.
            </p>
            <div className="confirm-summary">
              {recordSummary(kind, record).slice(0, 5).map((s) => (
                <div key={s.label}>
                  <span className="muted">{s.label}</span>
                  <span>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        ),
        onOk: async () => {
          await dispatch(slice.remove(record.id)).unwrap();
          message.success(`${label} deleted`);
        },
      });
    },
    [dispatch, kind, patient?.fullName, slice, title],
  );

  // The voice agent opens the same dialogs the user clicks.
  useEffect(
    () =>
      RecordRegistry.register({
        kind,
        openCreate,
        openEdit: (id: string) => {
          const found = rowsRef.current.find((r) => r.id === id);
          if (!found) return false;
          openEdit(found);
          return true;
        },
        setSearch: (q: string) => setSearch(q),
      }),
    [kind, openCreate, openEdit],
  );

  const actions = useCallback(
    (row: RecordOf<K>): ReactNode => (
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <Tooltip title="Edit">
          <Button type="text" size="small" icon={<Pencil size={15} />} onClick={() => openEdit(row)} aria-label={`Edit ${recordLabel(kind, row)}`} />
        </Tooltip>
        <Tooltip title="Delete">
          <Button type="text" size="small" danger icon={<Trash2 size={15} />} onClick={() => remove(row)} aria-label={`Delete ${recordLabel(kind, row)}`} />
        </Tooltip>
      </div>
    ),
    [kind, openEdit, remove],
  );

  const formModal = (
    <RecordFormModal
      kind={kind}
      open={formOpen}
      onOpen={() => setFormOpen(true)}
      onClose={() => {
        setFormOpen(false);
        setEditing(undefined);
      }}
      record={editing}
    />
  );

  return { rows, loading: overview.loading, patient, search, setSearch, openCreate, openEdit, remove, actions, formModal };
}
