import type { Tool } from '../types';
import { CardStatus, HomeRecents, NavDot, SidebarRecents, useMorpheusAsk, useMorpheusNewChat } from './shellParts';
import { MORPHEUS_HREF, MorpheusProvider } from './state';

export const morpheus: Tool = {
  id: 'morpheus',
  name: 'Morpheus',
  description: 'Coding agent on your laptop',
  icon: 'code',
  href: MORPHEUS_HREF,
  Provider: MorpheusProvider,
  NavBadge: NavDot,
  Status: CardStatus,
  SidebarSection: SidebarRecents,
  HomeSection: HomeRecents,
  useAsk: useMorpheusAsk,
  useNewChat: useMorpheusNewChat,
};
