import type { Tool } from '../types';
import { SoonBadge, SoonStatus } from './parts';

export const automations: Tool = {
  id: 'automations',
  name: 'Automations',
  description: 'Routines that run on their own',
  icon: 'bolt',
  href: '/automations/',
  Badge: SoonBadge,
  Status: SoonStatus,
};
