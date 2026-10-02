import type { ComponentType, ReactNode } from 'react';
import type { IconName } from '@/ui/Icon';

export interface Ask {
  placeholder: string;
  submit: (prompt: string) => void;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  href: string;
  Provider?: ComponentType<{ children: ReactNode }>;
  NavBadge?: ComponentType;
  Status?: ComponentType;
  SidebarSection?: ComponentType;
  HomeSection?: ComponentType;
  useAsk?: () => Ask;
  useNewChat?: () => () => void;
}
