import { ClipboardList, Inbox, LayoutDashboard, Settings, Users } from 'lucide-react';
import type { PageModule } from '@/registry/pageRegistry';

/** The icon that stands for a module everywhere: sidebar, bottom bar, menu and page headers. */
export const moduleIcons: Record<PageModule, JSX.Element> = {
  dashboard: <LayoutDashboard size={18} />,
  patient: <Users size={18} />,
  inbox: <Inbox size={18} />,
  summary: <ClipboardList size={18} />,
  configuration: <Settings size={18} />,
};
