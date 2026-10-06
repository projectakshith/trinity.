import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SourceItem, SourceResult } from '../types';

interface AssignmentData {
  course?: string;
  week?: number;
  assignment?: number;
  title?: string;
  due?: string;
  url?: string;
  is_submitted?: boolean;
  questions?: { number: number; points?: number; type?: string }[];
}

interface StateData {
  lastWeek?: number;
  scraped?: number[];
  answered?: number[];
  submitted?: number[];
}

function resolveNptelDir(): string | null {
  const candidates = [
    join(process.cwd(), 'cypher/nptel'),
    join(process.cwd(), '../cypher/nptel'),
    join(homedir(), 'Developer/cypher/nptel'),
    join(homedir(), 'dev/cypher/nptel'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function readNptel(): SourceResult {
  const dir = resolveNptelDir();
  if (!dir) {
    return { source: 'nptel', ok: false, error: 'Cypher NPTEL directory not found', items: [] };
  }

  const items: SourceItem[] = [];

  try {
    const stateFile = join(dir, 'data/state.json');
    let state: StateData = {};
    if (existsSync(stateFile)) {
      try {
        state = JSON.parse(readFileSync(stateFile, 'utf8')) as StateData;
      } catch {}
    }

    const outDir = join(dir, 'out');
    if (existsSync(outDir)) {
      const courses = readdirSync(outDir).filter((d) => !d.startsWith('.'));
      for (const course of courses) {
        const courseDir = join(outDir, course);
        const weekDirs = readdirSync(courseDir)
          .filter((d) => /^week\d+_assignment\d+$/u.test(d))
          .sort();

        // Check the most recent 2 assignments for due dates and submission status
        const recentDirs = weekDirs.slice(-2);
        for (const weekDir of recentDirs) {
          const assignmentJson = join(courseDir, weekDir, 'assignment.json');
          const answersJson = join(courseDir, weekDir, 'answers.json');

          if (!existsSync(assignmentJson)) continue;

          let data: AssignmentData = {};
          try {
            data = JSON.parse(readFileSync(assignmentJson, 'utf8')) as AssignmentData;
          } catch {
            continue;
          }

          const hasAnswers = existsSync(answersJson);
          const week = data.week ?? 0;
          const dueStr = data.due ? new Date(data.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
          const dueTime = data.due ? Date.parse(data.due) : Date.now();
          const isSubmitted = Boolean(data.is_submitted || state.submitted?.includes(week));

          items.push({
            source: 'nptel',
            ref: `nptel:${course}:week${week}`,
            at: dueTime,
            from: `NPTEL (${course})`,
            title: `Week ${week} Assignment: ${isSubmitted ? 'Submitted' : hasAnswers ? 'Ready to submit' : 'Pending'}`,
            text: `Course: ${course}. Title: ${data.title ?? `Week ${week}`}. Due: ${dueStr}. Status: ${isSubmitted ? 'Submitted' : 'Pending submission'}. Questions: ${data.questions?.length ?? 0}. Answers: ${hasAnswers ? 'Solved & verified' : 'Not generated yet'}.`,
            unread: !isSubmitted,
            url: data.url,
          });
        }
      }
    }

    return {
      source: 'nptel',
      ok: true,
      items,
    };
  } catch (err) {
    return {
      source: 'nptel',
      ok: false,
      error: (err as Error).message,
      items: [],
    };
  }
}
