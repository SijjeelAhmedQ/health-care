import { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FileText, Pill, Search, Settings, Stethoscope, UserRound, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { appointmentSelectors } from '@/store/slices/appointmentSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import { medicationSelectors } from '@/store/slices/medicationSlice';
import { PageRegistry } from '@/registry/pageRegistry';
import { mockDb } from '@/services/api';
import { formatTime } from '@/utils/format';
import { useDebouncedValue } from '@/hooks';

interface Hit {
  key: string;
  label: string;
  sub: string;
  path: string;
  patientId?: string;
}

export function GlobalSearch({ autoFocus, onSelect }: { autoFocus?: boolean; onSelect?: () => void }) {
  const [value, setValue] = useState('');
  const q = useDebouncedValue(value.trim().toLowerCase(), 150);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const appointments = useAppSelector(appointmentSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const medications = useAppSelector(medicationSelectors.selectAll);

  const groups = useMemo(() => {
    if (q.length < 2) return [];
    const has = (s?: string) => (s ?? '').toLowerCase().includes(q);
    const out: Array<{ title: string; icon: JSX.Element; hits: Hit[] }> = [];
    const pts = patients.filter((p) => has(p.fullName) || has(p.mrn) || has(p.phone)).slice(0, 5);
    if (pts.length) out.push({ title: 'Patients', icon: <Users size={14} />, hits: pts.map((p) => ({ key: `p-${p.id}`, label: p.fullName, sub: `${p.mrn} · ${p.age}y ${p.gender}`, path: `/patients/${p.id}`, patientId: p.id })) });
    const appts = appointments.filter((a) => has(a.patientName) || has(a.code) || has(a.providerName)).slice(0, 4);
    if (appts.length) out.push({ title: 'Appointments', icon: <CalendarDays size={14} />, hits: appts.map((a) => ({ key: `a-${a.id}`, label: `${a.patientName} — ${formatTime(a.startTime)}`, sub: `${a.date} · ${a.providerName} · ${a.status}`, path: `/appointments/${a.id}` })) });
    const provs = providers.filter((p) => has(p.fullName) || has(p.specialty)).slice(0, 4);
    if (provs.length) out.push({ title: 'Providers', icon: <UserRound size={14} />, hits: provs.map((p) => ({ key: `pr-${p.id}`, label: p.fullName, sub: `${p.specialty} · ${p.locationName}`, path: `/providers/${p.id}` })) });
    const meds = medications.filter((m) => has(m.name)).slice(0, 3);
    if (meds.length) out.push({ title: 'Medications', icon: <Pill size={14} />, hits: meds.map((m) => ({ key: `m-${m.id}`, label: `${m.name} ${m.dosage}`, sub: `${m.patientName} · ${m.frequency}`, path: `/patients/${m.patientId}/medications`, patientId: m.patientId })) });
    const cons = mockDb.consultations.filter((c) => has(c.patientName) || has(c.diagnosis)).slice(0, 3);
    if (cons.length) out.push({ title: 'Recent Consultations', icon: <Stethoscope size={14} />, hits: cons.map((c) => ({ key: `c-${c.id}`, label: `${c.patientName} — ${c.providerName}`, sub: `${c.date} · ${c.diagnosis ?? c.chiefComplaint}`, path: `/clinical/consultation?patient=${c.patientId}`, patientId: c.patientId })) });
    const pages = PageRegistry.all().filter((p) => !p.requiresContext && p.module !== 'dev' && (has(p.title) || p.aliases.some((a) => a.includes(q)))).slice(0, 5);
    if (pages.length) out.push({ title: 'Pages & Settings', icon: p(pages[0].module), hits: pages.map((pg) => ({ key: `pg-${pg.id}`, label: pg.title, sub: `Page ${pg.number} · ${pg.path}`, path: pg.path })) });
    return out;
  }, [q, patients, appointments, providers, medications]);

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

  useEffect(() => {
    if (!autoFocus) return;
  }, [autoFocus]);

  return (
    <AutoComplete
      className="app-header-search"
      value={value}
      options={options}
      onChange={setValue}
      onSelect={(_, option) => {
        const hit = (option as { hit?: Hit }).hit;
        if (!hit) return;
        if (hit.patientId) dispatch(setCurrentPatient(hit.patientId));
        navigate(hit.path);
        setValue('');
        onSelect?.();
      }}
      notFoundContent={q.length >= 2 ? <div style={{ padding: 8 }} className="muted">No results for “{value}”</div> : null}
      popupMatchSelectWidth={420}
      style={{ width: '100%' }}
    >
      <Input
        allowClear
        autoFocus={autoFocus}
        prefix={<Search size={15} className="muted" />}
        placeholder="Search patients, appointments, providers, pages…  (Ctrl+K for commands)"
        aria-label="Global search"
      />
    </AutoComplete>
  );
}

function p(module: string) {
  return module === 'configuration' ? <Settings size={14} /> : <FileText size={14} />;
}
