/**
 * The provider's day in words — built only from their workload, so it can be
 * read aloud and trusted: nothing in it is generated.
 */
import dayjs from 'dayjs';
import type { ProviderWorkload } from './providerWorkload';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const time = (hhmm: string) => dayjs(`2000-01-01T${hhmm}`).format('h:mm A');

export interface ProviderNarrative {
  sections: Array<{ title: string; body: string }>;
  text: string;
}

export function buildProviderNarrative(w: ProviderWorkload): ProviderNarrative {
  const sections: ProviderNarrative['sections'] = [];
  const remaining = w.today.filter((a) => !['Completed', 'Cancelled', 'No Show'].includes(a.status));

  let today = w.today.length ? `You have ${plural(w.today.length, 'appointment')} today` : 'You have no appointments today';
  if (w.today.length) today += remaining.length ? `, ${remaining.length} still to see.` : ', and all of them are done.';
  else today += '.';
  if (w.nextToday) today += ` Next is ${w.nextToday.patientName} at ${time(w.nextToday.startTime)} — ${w.nextToday.type.toLowerCase()}${w.nextToday.reason ? ` for ${w.nextToday.reason.toLowerCase()}` : ''}.`;
  sections.push({ title: 'Today', body: today });

  sections.push({
    title: 'This week',
    body: w.upcoming.length ? `${plural(w.upcoming.length, 'more appointment')} are booked over the next seven days.` : 'Nothing else is booked in the next seven days.',
  });

  let tasks = w.openTasks.length ? `You have ${plural(w.openTasks.length, 'open task')}` : 'You have no open tasks';
  if (w.overdueTasks.length) tasks += `, ${w.overdueTasks.length} overdue — the oldest is "${w.overdueTasks[0].title}" for ${w.overdueTasks[0].patientName}.`;
  else tasks += w.openTasks.length ? ', none overdue.' : '.';
  sections.push({ title: 'Tasks', body: tasks });

  let recalls = w.dueRecalls.length ? `${plural(w.dueRecalls.length, 'recall')} ${w.dueRecalls.length === 1 ? 'is' : 'are'} due for your patients` : 'No recalls are due for your patients';
  recalls += w.overdueRecalls.length ? `, ${w.overdueRecalls.length} past the due date.` : '.';
  sections.push({ title: 'Recalls', body: recalls });

  const flagged = w.unfiledInbox.filter((i) => i.attention);
  sections.push({
    title: 'Inbox',
    body: w.unfiledInbox.length
      ? `${plural(w.unfiledInbox.length, 'Inbox item')} ${w.unfiledInbox.length === 1 ? 'is' : 'are'} unfiled${flagged.length ? `, ${flagged.length} flagged for attention` : ''}.`
      : 'Your Inbox is clear.',
  });

  return { sections, text: sections.map((s) => s.body).join(' ') };
}
