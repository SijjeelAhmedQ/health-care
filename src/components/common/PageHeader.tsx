import type { ReactNode } from 'react';
import { Breadcrumb, Tooltip } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { PageRegistry, moduleLabels } from '@/registry/pageRegistry';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Override breadcrumb items; defaults derive from the page registry */
  breadcrumbs?: Array<{ title: ReactNode; href?: string }>;
  extra?: ReactNode;
}

const moduleHome: Record<string, string> = {
  dashboard: '/dashboard',
  patients: '/patients',
  clinical: '/clinical',
  appointments: '/appointments',
  providers: '/providers',
  roster: '/roster',
  practice: '/practice',
  users: '/users',
  configuration: '/configuration',
  reports: '/reports',
  dev: '/dev/voice-console',
};

export function PageHeader({ title, subtitle, actions, breadcrumbs, extra }: Props) {
  const location = useLocation();
  const page = PageRegistry.matchPath(location.pathname);
  const items =
    breadcrumbs ??
    (page
      ? [
          { title: <Link to="/dashboard">Home</Link> },
          { title: <Link to={moduleHome[page.module]}>{moduleLabels[page.module]}</Link> },
          ...(page.parentId && page.parentId !== page.id ? [{ title: PageRegistry.get(page.parentId)?.title ?? '' }] : []),
          { title },
        ]
      : [{ title: <Link to="/dashboard">Home</Link> }, { title }]);

  return (
    <div className="page-header">
      <Breadcrumb items={items} />
      <div className="page-header-row">
        <div>
          <h1 className="page-header-title">
            {title}
            {page && (
              <Tooltip title={`Say "go to page ${page.number}"`}>
                <span className="page-number-chip">
                  <Hash size={11} /> {page.number}
                </span>
              </Tooltip>
            )}
          </h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {extra}
    </div>
  );
}
