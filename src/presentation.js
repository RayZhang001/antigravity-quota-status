function groupShortName(displayName) {
    const name = String(displayName || 'Models');
    const lower = name.toLowerCase();

    if (lower.includes('gemini')) return 'Gemini';
    if (lower.includes('claude') || lower.includes('gpt')) return 'Claude/GPT';

    return name.split(/\s+/)[0] || 'Models';
}

function compactPct(value) {
    return String(value || '—').replace('%', '');
}

function compactCountdown(value) {
    return String(value || '').replace(/\s+/g, '');
}

function renderStatusBarText(
    groups,
    { displayMode = 'both', showResetCountdown = true } = {}
) {
    const renderedGroups = groups.map((group) => {
        const parts = [];

        if (
            (displayMode === 'both' || displayMode === 'weekly') &&
            group.weekly
        ) {
            parts.push(`W ${group.weekly.pct}`);
        }

        if (
            (displayMode === 'both' || displayMode === 'fiveHour') &&
            group.fiveHour
        ) {
            let fiveHour = `5h ${group.fiveHour.pct}`;

            if (showResetCountdown && group.fiveHour.resetIn) {
                fiveHour += ` $(history)${compactCountdown(group.fiveHour.resetIn)}`;
            }

            parts.push(fiveHour);
        }

        if (parts.length === 0) {
            return null;
        }

        return `${groupShortName(group.displayName)}  ${parts.join(' · ')}`;
    }).filter(Boolean);

    if (renderedGroups.length === 0) {
        return '$(warning) Antigravity Quota unavailable';
    }

    return `$(sparkle) ${renderedGroups.join('  │  ')}`;
}

function formatResetAt(date, includeDate) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const datePart = includeDate
        ? `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} `
        : '';
    return `${datePart}${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function buildTooltipMarkdown(groups) {
    const lines = ['## Antigravity Quota Status', ''];

    for (const group of groups) {
        lines.push(`**$(symbol-event) ${group.displayName}**`);

        if (group.weekly) {
            const resetAt = formatResetAt(group.weekly.resetAt, true);
            lines.push(`- **Weekly:** \`${group.weekly.pct}\`${group.weekly.resetIn ? ` · resets in **${group.weekly.resetIn}**` : ''}${resetAt ? ` (${resetAt})` : ''}`);
        }

        if (group.fiveHour) {
            const resetAt = formatResetAt(group.fiveHour.resetAt, false);
            lines.push(`- **5-hour:** \`${group.fiveHour.pct}\`${group.fiveHour.resetIn ? ` · resets in **${group.fiveHour.resetIn}**` : ''}${resetAt ? ` (${resetAt})` : ''}`);
        }

        lines.push('');
    }

    lines.push('---');
    lines.push('$(refresh) [Refresh](command:antigravityQuota.refresh) · $(settings-gear) [Open Models](command:antigravityQuota.openModelsTab) · $(list-unordered) [Model details](command:antigravityQuota.showModelBreakdown)');
    return lines.join('\n');
}

module.exports = {
    groupShortName,
    renderStatusBarText,
    buildTooltipMarkdown
};
