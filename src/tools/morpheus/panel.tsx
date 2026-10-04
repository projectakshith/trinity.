'use client';

import { createContext, useContext } from 'react';
import { Icon } from '@/ui/Icon';

interface Panel {
  hidden: boolean;
  show: () => void;
}

export const PanelContext = createContext<Panel>({ hidden: false, show: () => undefined });

export function PanelToggle() {
  const { hidden, show } = useContext(PanelContext);
  return (
    <button type="button" className={`ghost-btn panel-toggle${hidden ? ' is-hidden' : ''}`} onClick={show} aria-label="show sessions">
      <Icon name="sidebar" size={16} />
    </button>
  );
}
