/*
 * Placeholder for Trinity's automations: scheduled and triggered routines.
 */

import { Icon } from '../lib/icons';
import { TopBar } from './TopBar';

export function Automations({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="view">
      <TopBar onMenu={onMenu} title="Automations" />
      <div className="center-page">
        <div className="empty-card">
          <div className="tool-icon">
            <Icon name="bolt" size={20} />
          </div>
          <h1 className="serif-title">Automations</h1>
          <p className="lede">Routines that run on their own, on a schedule or when something happens, and report back here. Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
