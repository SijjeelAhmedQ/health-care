import { useMemo, useState } from 'react';
import { Input, Layout, Menu, type MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, Building2, CalendarClock, CalendarDays, LayoutDashboard, Search, Settings, ShieldCheck, Stethoscope, UserRound, Users, Mic } from 'lucide-react';
import { PageRegistry, moduleLabels, type PageModule } from '@/registry/pageRegistry';
import { useAppSelector } from '@/store';
import { layout as layoutTokens } from '@/theme/tokens';

const moduleOrder: PageModule[] = ['dashboard', 'patients', 'clinical', 'appointments', 'providers', 'roster', 'practice', 'users', 'reports', 'configuration'];
const moduleIcons: Record<PageModule, JSX.Element> = {
  dashboard: <LayoutDashboard size={16} />,
  patients: <Users size={16} />,
  clinical: <Stethoscope size={16} />,
  appointments: <CalendarDays size={16} />,
  providers: <UserRound size={16} />,
  roster: <CalendarClock size={16} />,
  practice: <Building2 size={16} />,
  users: <ShieldCheck size={16} />,
  configuration: <Settings size={16} />,
  reports: <BarChart3 size={16} />,
  dev: <Mic size={16} />,
};

interface Props {
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onCollapse, mobile, onNavigate }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const voiceStatus = useAppSelector((s) => s.voice.status);
  const currentPage = PageRegistry.matchPath(location.pathname);
  const activeKey = currentPage?.parentId ?? currentPage?.id;

  const items = useMemo<MenuProps['items']>(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return PageRegistry.sidebarPages()
        .filter((p) => p.title.toLowerCase().includes(q) || p.aliases.some((a) => a.includes(q)) || String(p.number) === q)
        .map((p) => ({ key: p.id, label: p.title, icon: moduleIcons[p.module] }));
    }
    return moduleOrder.map((module) => {
      const pages = PageRegistry.byModule(module).filter((p) => !p.hideInSidebar);
      return {
        key: `module:${module}`,
        icon: moduleIcons[module],
        label: moduleLabels[module],
        children: pages.map((p) => ({ key: p.id, label: p.title })),
      };
    });
  }, [query]);

  const openKeys = currentPage ? [`module:${currentPage.module}`] : [];
  const [openState, setOpenState] = useState<string[]>(openKeys);

  return (
    <Layout.Sider
      className="app-sider"
      theme="dark"
      width={layoutTokens.sidebarWidth}
      collapsedWidth={mobile ? 0 : layoutTokens.sidebarCollapsedWidth}
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      breakpoint="lg"
      style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
    >
      <div className="app-sider-brand">
        <div className="app-sider-brand-mark">
          <Activity size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div>
            <div className="app-sider-brand-title">CareFlow</div>
            <div className="app-sider-brand-sub">Practice Management</div>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="app-sider-search">
          <Input
            allowClear
            size="small"
            prefix={<Search size={13} color="#7f94a4" />}
            placeholder="Search menu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search navigation"
          />
        </div>
      )}
      <Menu
        className="app-sider-menu"
        theme="dark"
        mode="inline"
        items={items}
        selectedKeys={activeKey ? [activeKey] : []}
        openKeys={collapsed ? undefined : query ? undefined : openState}
        onOpenChange={(keys) => setOpenState(keys as string[])}
        onClick={({ key }) => {
          const page = PageRegistry.get(String(key));
          if (page && !page.requiresContext) {
            navigate(page.path);
            onNavigate?.();
          }
        }}
      />
      {!collapsed && (
        <div className="app-sider-footer">
          <Mic size={13} color={voiceStatus === 'listening' ? '#ff7a7a' : '#4fc3f7'} />
          <span>Voice assistant {voiceStatus === 'idle' ? 'ready' : voiceStatus.replace('_', ' ')}</span>
        </div>
      )}
    </Layout.Sider>
  );
}
