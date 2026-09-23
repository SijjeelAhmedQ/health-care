import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Tag } from 'antd';
import { Search, UserRound, UserRoundCheck } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import type { Patient } from '@/types/domain';
import { AppModal } from '@/components/common/AppModal';
import { Avatar, EmptyState } from '@/components/common';
import { useDebouncedValue } from '@/hooks';

/** Name, MRN, phone or email — whatever the user remembers about the patient. */
export function searchPatients(patients: Patient[], query: string): Patient[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return patients
    .filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000') ||
        p.email.toLowerCase().includes(q),
    )
    .slice(0, 25);
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a patient became the active context. */
  onSelected?: (patient: Patient) => void;
  title?: string;
  description?: string;
}

/**
 * The one way to choose the patient the application works on. Opened from the
 * banner, from the empty-context screen and from the Patient module.
 */
export function PatientPicker({ open, onClose, onSelected, title = 'Select a patient', description = 'Everything you do next — medications, diagnoses, tasks, recalls, appointments — belongs to the patient you pick here.' }: Props) {
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const recentIds = useAppSelector((s) => s.patients.recentPatientIds);
  const currentId = useAppSelector((s) => s.patients.currentPatientId);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 150);
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus after the dialog's open animation so the caret really lands in the box.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  const recent = useMemo(() => recentIds.map((id) => patients.find((p) => p.id === id)).filter((p): p is Patient => !!p), [recentIds, patients]);
  const results = useMemo(() => (debounced.trim() ? searchPatients(patients, debounced) : recent.length ? recent : patients.slice(0, 12)), [debounced, patients, recent]);
  const heading = debounced.trim() ? `${results.length} match${results.length === 1 ? '' : 'es'}` : recent.length ? 'Recently used' : 'All patients';

  const select = (patient: Patient) => {
    dispatch(setCurrentPatient(patient.id));
    onSelected?.(patient);
    onClose();
  };

  return (
    <AppModal open={open} onClose={onClose} title={title} description={description} icon={<UserRound size={18} />} size="lg" footer={null}>
      <Input
        ref={inputRef}
        size="large"
        allowClear
        prefix={<Search size={16} className="muted" />}
        placeholder="Search by name, MRN, phone or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPressEnter={() => results.length === 1 && select(results[0])}
        aria-label="Search patients"
      />

      <div className="patient-picker-heading">{heading}</div>

      {results.length === 0 ? (
        <EmptyState
          title="No patient matches"
          description={<>Nothing matches “{debounced}”. Check the spelling, or search by MRN instead.</>}
          icon={<UserRound size={40} strokeWidth={1.4} />}
        />
      ) : (
        <ul className="patient-picker-list">
          {results.map((p) => {
            const isCurrent = p.id === currentId;
            return (
              <li key={p.id}>
                <button type="button" className={`patient-picker-item ${isCurrent ? 'is-current' : ''}`} onClick={() => select(p)}>
                  <Avatar name={p.fullName} size={38} />
                  <span className="patient-picker-item-main">
                    <span className="patient-picker-item-name">
                      {p.fullName}
                      {isCurrent && <Tag color="blue" style={{ marginInlineStart: 8 }}>Selected</Tag>}
                      {p.status !== 'Active' && <Tag style={{ marginInlineStart: 8 }}>{p.status}</Tag>}
                    </span>
                    <span className="patient-picker-item-meta">
                      {p.mrn} · {p.age}y {p.gender} · {p.phone}
                    </span>
                  </span>
                  <span className="patient-picker-item-action">
                    <UserRoundCheck size={16} aria-hidden />
                    {isCurrent ? 'Keep' : 'Select'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="patient-picker-footer">
        <span className="muted">Tip: say “select patient Ahmed Khan” to do this by voice.</span>
        <Button onClick={onClose}>Close</Button>
      </div>
    </AppModal>
  );
}
