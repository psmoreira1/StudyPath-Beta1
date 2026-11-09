/* Study Path – Export page behavior
 *
 * Data: the other pages can hand this page their events by either setting
 *   window.STUDY_PATH_EVENTS = [...]            (before this script runs), or
 *   localStorage.setItem('studyPathEvents', JSON.stringify([...]))
 * Each event: { title, start, end, type, location?, description? }
 *   start/end: ISO strings ("2026-09-14T09:00:00-05:00"), or "YYYY-MM-DD" for all-day
 *   type: "schedule" | "class" | "study"
 * If no events are provided, the .ics falls back to the term start/end dates.
 */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const TERM = { name: 'Fall 2026', start: '2026-08-26', end: '2026-12-13' };
  const TYPES = ['schedule', 'class', 'study'];            // same order as the checkboxes

  const exportBtn  = $('#export-btn');
  const checks     = $$('.include-list .check');
  const fmtInputs  = $$('input[name="format"]');
  const subtitle   = $('.ready-head small');
  const heading    = $('.ready-head strong');
  const privacy    = $('.privacy');

  /* ---------- state helpers ---------- */
  const selectedTypes = () => TYPES.filter((_, i) => checks[i] && checks[i].checked);
  const currentFormat = () => (fmtInputs[1] && fmtInputs[1].checked ? 'ics' : 'pdf');

  function loadEvents() {
    if (Array.isArray(window.STUDY_PATH_EVENTS)) return window.STUDY_PATH_EVENTS;
    try {
      const raw = localStorage.getItem('studyPathEvents');
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* storage blocked or bad JSON: fall through */ }
    return [];
  }

  /* ---------- summary card ---------- */
  function refreshSummary() {
    const n = selectedTypes().length;
    const fmt = currentFormat() === 'pdf' ? 'PDF' : 'Calendar file';
    subtitle.textContent = `${TERM.name} · ${n} content type${n === 1 ? '' : 's'} · ${fmt}`;
    heading.textContent = n ? 'Ready to export' : 'Nothing selected';
    exportBtn.disabled = n === 0;
  }

  /* ---------- .ics builder ---------- */
  const pad = n => String(n).padStart(2, '0');
  const isDateOnly = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dateOnly = s => s.replace(/-/g, '');
  const utcStamp = d =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

  function nextDay(ymd) {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  // Fold long lines at 75 chars, as the iCalendar spec requires
  const fold = line => line.length <= 75 ? line : line.match(/.{1,74}/g).join('\r\n ');

  function buildICS(events) {
    const now = utcStamp(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Study Path//Export//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Study Path ${TERM.name}`];

    events.forEach((ev, i) => {
      const allDay = isDateOnly(ev.start);
      lines.push('BEGIN:VEVENT', `UID:studypath-${i}-${dateOnly(allDay ? ev.start : ev.start.slice(0, 10))}@studypath.local`, `DTSTAMP:${now}`);
      if (allDay) {
        lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`, `DTEND;VALUE=DATE:${dateOnly(ev.end && isDateOnly(ev.end) ? nextDay(ev.end) : nextDay(ev.start))}`);
      } else {
        lines.push(`DTSTART:${utcStamp(new Date(ev.start))}`, `DTEND:${utcStamp(new Date(ev.end || ev.start))}`);
      }
      lines.push(`SUMMARY:${esc(ev.title || 'Untitled')}`);
      if (ev.location)    lines.push(`LOCATION:${esc(ev.location)}`);
      if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- delivery ---------- */
  function download(file) {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareOrDownload(file) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Study Path schedule' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;        // user closed the share sheet
    }
    download(file);
  }

  function flash(message) {
    const original = privacy.lastChild.textContent;
    privacy.lastChild.textContent = ` ${message}`;
    setTimeout(() => { privacy.lastChild.textContent = original; }, 2500);
  }

  async function runExport() {
    const types = selectedTypes();
    if (!types.length) return;

    if (currentFormat() === 'pdf') {
      window.print();                                       // choose "Save as PDF" in the print dialog
      return;
    }

    let events = loadEvents().filter(ev => types.includes(ev.type));
    if (!events.length) {
      events = [
        { title: `${TERM.name} begins`, start: TERM.start, end: TERM.start, type: types[0] },
        { title: `${TERM.name} ends`,   start: TERM.end,   end: TERM.end,   type: types[0] },
      ];
    }
    const file = new File([buildICS(events)], 'study-path-fall-2026.ics', { type: 'text/calendar' });
    await shareOrDownload(file);
    flash('Calendar file ready');
  }

  /* ---------- wire up ---------- */
  checks.forEach(c => c.addEventListener('change', refreshSummary));
  fmtInputs.forEach(r => r.addEventListener('change', refreshSummary));
  exportBtn.addEventListener('click', runExport);
  refreshSummary();
})();
