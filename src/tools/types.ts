import type { ComponentType, ReactNode } from 'react';
import type { IconName } from '@/ui/Icon';

export interface Ask {
  placeholder: string;
  submit: (prompt: string) => void;
}

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  detail?: string;
  glyph?: string;
  run: () => void;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  href: string;
  Provider?: ComponentType<{ children: ReactNode }>;
  Badge?: ComponentType;
  Status?: ComponentType;
  HomeSection?: ComponentType;
  useAsk?: () => Ask;
  usePalette?: () => PaletteItem[];
}
