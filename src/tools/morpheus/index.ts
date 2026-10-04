import type { Tool } from '../types';
import { CardStatus, HomeWork, NavGlyph, useMorpheusAsk, useMorpheusPalette } from './shellParts';
import { MORPHEUS_HREF, MorpheusProvider } from './state';

export const morpheus: Tool = {
  id: 'morpheus',
  name: 'Morpheus',
  description: 'Coding agent on your laptop',
  icon: 'code',
  href: MORPHEUS_HREF,
  Provider: MorpheusProvider,
  Badge: NavGlyph,
  Status: CardStatus,
  HomeSection: HomeWork,
  useAsk: useMorpheusAsk,
  usePalette: useMorpheusPalette,
};
