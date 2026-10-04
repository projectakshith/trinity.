import { automations } from './automations';
import { brief } from './brief';
import { morpheus } from './morpheus';
import type { Tool } from './types';

export const tools: Tool[] = [brief, morpheus, automations];

export const askTool = tools.find((t) => t.useAsk);
