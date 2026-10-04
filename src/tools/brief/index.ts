import type { Tool } from '../types';
import { BriefBadge, BriefStatus, HomeBrief } from './parts';
import { BRIEF_HREF, BriefProvider } from './state';

export const brief: Tool = {
  id: 'brief',
  name: 'Brief',
  description: 'What matters across mail, WhatsApp and calendar',
  icon: 'sparkle',
  href: BRIEF_HREF,
  Provider: BriefProvider,
  Badge: BriefBadge,
  Status: BriefStatus,
  HomeSection: HomeBrief,
};
