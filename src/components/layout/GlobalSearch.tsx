import { useMemo, useState } from 'react';
import { AutoComplete, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { usePatientOverview } from '@/hooks/usePatientData';
import { PageRegistry, moduleLabels } from '@/registry/pageRegistry';
import { recordLabel, recordSubtitle, type AnyRecord } from '@/services/records/recordMapping';
import { moduleIcons } from './MobileNav';
import { useDebouncedValue } from '@/hooks';
import type { AIRecordKind } from '@/types/ai';

interface Hit {
  key: string;
  label: string;
  sub: string;
  path: string;
  /** Selecting a patient hit also switches the working context. */
  patientId?: string;
}

/**
 * One search box for the two things worth finding globally: a patient (which
 * switches context), and a module. Records are searched inside their module,
 * where the results can be acted on.
 */
export function GlobalSearch({ autoFocus, onSelect }: { autoFocus?: boolean; onSelect?: () => void }) {
  const [value, setValue] = useState('');
  const q = useDebouncedValue(value.trim().toLowerCase(), 150);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const overview = usePatientOverview();

  const groups = useMemo(() => {
    if (q.length < 2) return [];
    const has = (s?: string) => (s ?? '').toLowerCase().includes(q);
    const out: Array<{ title: string; icon: JSX.Element; hits: Hit[] }> = [];

    const pts = patients.filter((p) => has(p.fullName) || has(p.mrn) || has(p.phone)).slice(0, 5);
    if (pts.length) {
      out.push({
        title: 'Patients — select to switch context',
        icon: <Users size={14} />,
        hits: pts.map((p) => ({ key: `p-${p.id}`, label: p.fullName, sub: `${p.mrn} · ${p.age}y ${p.gender}`, path: '/dashboard', patientId: p.id })),
      });
    }

    // Records of the patient currently being worked on.
    const kinds: Array<[AIRecordKind, AnyRecord[], string]> = [
      ['medication', overview.medications, '/medications'],
      ['diagnosis', overview.diagnoses, '/diagnoses'],
      ['task', overview.tasks, '/tasks'],
      ['recall', overview.recalls, '/recalls'],
      ['appointment', overview.appointments, '/appointments'],
    ];
    for (const [kind, rows, path] of kinds) {
      const hits = rows
        .filter((r) => `${recordLabel(kind, r)} ${recordSubtitle(kind, r)}`.toLowerCase().includes(q))
        .slice(0, 3)
        .map((r) => ({ key: `${kind}-${(r as { id: string }).id}`, label: recordLabel(kind, r), sub: recordSubtitle(kind, r), path }));
      if (hits.length) out.push({ title: `${moduleLabels[kind]} — this patient`, icon: moduleIcons[kind], hits });
    }

    const pages = PageRegistry.sidebarPages().filter((p) => has(p.title) || p.aliases.some((a) => a.includes(q)) || String(p.number) === q);
    if (pages.length) {
      out.push({
        title: 'Modules',
        icon: <FileText size={14} />,
        hits: pages.map((pg) => ({ key: `pg-${pg.id}`, label: pg.title, sub: `Page ${pg.number} · ${pg.path}`, path: pg.path })),
      });
    }
    return out;
  }, [q, patients, overview]);

  const options = groups.map((g) => ({
    label: (
      <span className="flex items-center gap-2" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a97a4' }}>
        {g.icon} {g.title}
      </span>
    ),
    options: g.hits.map((h) => ({
      value: h.key,
      label: (
        <div className="global-search-result">
          <strong style={{ fontWeight: 500 }}>{h.label}</strong>
          <span>{h.sub}</span>
        </div>
      ),
      hit: h,
    })),
  }));

  return (
    <AutoComplete
      className={autoFocus ? undefined : 'app-header-search'}
      value={value}
      options={options}
      onChange={setValue}
      onSelect={(_, option) => {
        const hit = (option as { hit?: Hit }).hit;
        if (!hit) return;
        if (hit.patientId) {
          const patient = patients.find((p) => p.id === hit.patientId);
          dispatch(setCurrentPatient(hit.patientId));
          if (patient) message.success(`${patient.fullName} is now the selected patient`);
        }
        navigate(hit.path);
        setValue('');
        onSelect?.();
      }}
      notFoundContent={q.length >= 2 ? <div style={{ padding: '10px 8px' }} className="muted">No results for “{value}”. Try a name, MRN or module.</div> : null}
      popupMatchSelectWidth={autoFocus ? true : 460}
      style={{ width: '100%' }}
    >
      <Input
        allowClear
        size={autoFocus ? 'large' : 'middle'}
        autoFocus={autoFocus}
        prefix={<Search size={15} className="muted" />}
        placeholder={autoFocus ? 'Search patients and modules…' : 'Search patients, this patient’s records, modules…  (Ctrl+K for commands)'}
        aria-label="Global search"
      />
    </AutoComplete>
  );
}
