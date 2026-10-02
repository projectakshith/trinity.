import { automations } from './automations';
import { morpheus } from './morpheus';
import type { Tool } from './types';

export const tools: Tool[] = [morpheus, automations];

export const askTool = tools.find((t) => t.useAsk);

export const chatTool = tools.find((t) => t.useNewChat);
