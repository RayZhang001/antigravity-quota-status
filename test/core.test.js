const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCountdown, formatPct } = require('../src/quotaClient');
const { renderStatusBarText, groupShortName } = require('../src/presentation');

test('formatPct clamps valid numeric fractions', () => {
    assert.equal(formatPct(0.923), '92%');
    assert.equal(formatPct(-0.1), '0%');
    assert.equal(formatPct(1.5), '100%');
    assert.equal(formatPct(undefined), '—');
});

test('formatCountdown renders days, hours, and minutes', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    assert.equal(formatCountdown(new Date('2026-08-17T15:05:00Z'), now), '2d 3h');
    assert.equal(formatCountdown(new Date('2026-08-15T14:05:00Z'), now), '2h 5m');
    assert.equal(formatCountdown(new Date('2026-08-15T12:25:00Z'), now), '25m');
    assert.equal(formatCountdown(new Date('2026-08-15T11:59:00Z'), now), 'Now');
});

test('groupShortName recognizes the two Antigravity quota families', () => {
    assert.equal(groupShortName('Gemini Models'), 'Gemini');
    assert.equal(groupShortName('Claude and GPT models'), 'Claude/GPT');
});

test('renderStatusBarText supports both and weekly-only modes', () => {
    const groups = [
        {
            displayName: 'Gemini Models',
            weekly: {
                pct: '92%',
                resetIn: '2d 3h'
            },
            fiveHour: {
                pct: '69%',
                resetIn: '2h 23m'
            }
        }
    ];

    assert.equal(
        renderStatusBarText(groups, {
            displayMode: 'both',
            showResetCountdown: true
        }),
        '$(sparkle) Gemini  W 92% · 5h 69% $(history)2h23m'
    );

    assert.equal(
        renderStatusBarText(groups, {
            displayMode: 'weekly',
            showResetCountdown: true
        }),
        '$(sparkle) Gemini  W 92%'
    );
});
