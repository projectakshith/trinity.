'use client';

import { TopBar } from '@/shell/TopBar';
import { Icon } from '@/ui/Icon';

export function AutomationsPage() {
  return (
    <div className="view">
      <TopBar title="Automations" />
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
