import type { ReactNode } from 'react';
import { Breadcrumb, Button, Tooltip } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Hash } from 'lucide-react';
import { PageRegistry, moduleHome, moduleLabels } from '@/registry/pageRegistry';
import { moduleIcons } from '@/components/layout/moduleIcons';
import { useResponsive } from '@/hooks';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Override breadcrumb items; defaults derive from the page registry */
  breadcrumbs?: Array<{ title: ReactNode; href?: string }>;
  extra?: ReactNode;
  /** Show a Back control. Defaults to true on detail pages (those with a :param route). */
  showBack?: boolean;
  /** The small line above the title; defaults to the module's name. Pass null to hide it. */
  eyebrow?: ReactNode | null;
  /** The tile left of the title; defaults to the module's icon. Pass null to hide it. */
  icon?: ReactNode | null;
}

/**
 * Every page starts here: where you are (breadcrumb + eyebrow), what this page
 * is (icon, title, subtitle), what you can do (actions) and how to get back.
 * The icon and eyebrow repeat the sidebar's own, so the two always agree.
 */
export function PageHeader({ title, subtitle, actions, breadcrumbs, extra, showBack, eyebrow, icon }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const page = PageRegistry.matchPath(location.pathname);
  const isDetail = !!page?.path.includes(':');
  const withBack = showBack ?? isDetail;
  const eyebrowNode = eyebrow === undefined ? (page ? moduleLabels[page.module] : undefined) : eyebrow;
  const iconNode = icon === undefined ? (page ? moduleIcons[page.module] : undefined) : icon;

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
      <div className="page-header-top">
        {withBack && (
          <Button type="text" size="small" className="page-header-back" icon={<ArrowLeft size={15} />} onClick={() => navigate(-1)}>
            Back
          </Button>
        )}
        {!isMobile && <Breadcrumb items={items} />}
      </div>
      <div className="page-header-row">
        <div className="page-header-main">
          {iconNode && (
            <span className="page-header-icon" aria-hidden>
              {iconNode}
            </span>
          )}
          <div className="page-header-text">
            {eyebrowNode && <div className="page-header-eyebrow">{eyebrowNode}</div>}
            <h1 className="page-header-title">
              {title}
              {page && !isMobile && (
                <Tooltip title={`Page ${page.number} — ask the assistant to open it by name or number`}>
                  <span className="page-number-chip">
                    <Hash size={11} aria-hidden /> {page.number}
                  </span>
                </Tooltip>
              )}
            </h1>
            {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {extra}
    </div>
  );
}
