const vscode = require('vscode');
const {
    getLanguageServerConnection,
    invalidateLanguageServerConnection
} = require('./antigravityConnection');
const { fetchQuotaSummary, fetchUserStatus } = require('./quotaClient');
const { renderStatusBarText, buildTooltipMarkdown } = require('./presentation');

const METADATA = {
    ideName: 'antigravity',
    extensionName: 'antigravity',
    locale: 'en'
};

let statusBarItem;
let pollTimer;
let lastQuotaSummary = null;
let updateInFlight = null;

function getConfiguration() {
    const config = vscode.workspace.getConfiguration('antigravityQuota');
    return {
        refreshIntervalSeconds: config.get('refreshIntervalSeconds', 120),
        displayMode: config.get('statusBarDisplay', 'both'),
        showResetCountdown: config.get('showResetCountdown', true)
    };
}

async function withConnectionRetry(operation) {
    let connection = await getLanguageServerConnection();

    try {
        return await operation(connection);
    } catch (firstError) {
        invalidateLanguageServerConnection();
        connection = await getLanguageServerConnection(true);

        try {
            return await operation(connection);
        } catch (secondError) {
            secondError.message = `${secondError.message} (after reconnect)`;
            throw secondError;
        }
    }
}

function applyQuotaToStatusBar(summary) {
    const config = getConfiguration();
    statusBarItem.text = renderStatusBarText(summary.groups, config);

    const markdown = new vscode.MarkdownString(buildTooltipMarkdown(summary.groups));
    markdown.isTrusted = { enabledCommands: [
        'antigravityQuota.refresh',
        'antigravityQuota.openModelsTab',
        'antigravityQuota.showModelBreakdown'
    ] };
    markdown.supportThemeIcons = true;
    statusBarItem.tooltip = markdown;
}

async function updateQuota(manual = false) {
    if (updateInFlight) return updateInFlight;

    updateInFlight = (async () => {
        if (manual) {
            statusBarItem.text = '$(sync~spin) Antigravity: checking…';
        }

        try {
            const summary = await withConnectionRetry((connection) =>
                fetchQuotaSummary(connection, METADATA)
            );

            if (summary.groups.length === 0) {
                throw new Error('Antigravity returned no quota groups');
            }

            lastQuotaSummary = summary;
            applyQuotaToStatusBar(summary);
        } catch (error) {
            statusBarItem.text = '$(warning) Antigravity Quota';
            statusBarItem.tooltip = `Unable to read Antigravity quota: ${error.message}\n\nClick to retry or inspect options.`;
        } finally {
            updateInFlight = null;
        }
    })();

    return updateInFlight;
}

function restartPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }

    const { refreshIntervalSeconds } = getConfiguration();
    const intervalMs = Math.max(30, Number(refreshIntervalSeconds) || 120) * 1000;
    pollTimer = setInterval(() => {
        void updateQuota(false);
    }, intervalMs);
}

async function openModelsTab() {
    await vscode.commands.executeCommand('workbench.action.openAntigravitySettings');

    setTimeout(() => {
        void vscode.commands.executeCommand(
            'workbench.action.openAntigravitySettingsWithId',
            'useAICredits',
            'Models'
        );
    }, 100);
}

async function showDetailsQuickPick() {
    const selected = await vscode.window.showQuickPick([
        {
            label: '$(refresh) Refresh quota now',
            description: 'Read the latest weekly and 5-hour quota summary',
            action: 'refresh'
        },
        {
            label: '$(settings-gear) Open Antigravity Models settings',
            description: 'Open the built-in quota screen',
            action: 'settings'
        },
        {
            label: '$(list-unordered) Show model-level details',
            description: 'Query model metadata on demand',
            action: 'models'
        },
        {
            label: '$(json) View raw quota response',
            description: 'Open the latest local RPC response as JSON',
            action: 'raw'
        }
    ], {
        placeHolder: 'Antigravity Quota Status'
    });

    if (!selected) return;

    switch (selected.action) {
        case 'refresh':
            await updateQuota(true);
            break;
        case 'settings':
            await openModelsTab();
            break;
        case 'models':
            await showModelsQuickPick();
            break;
        case 'raw':
            await showRawQuotaResponse();
            break;
        default:
            break;
    }
}

async function showRawQuotaResponse() {
    if (!lastQuotaSummary?.raw) {
        await updateQuota(true);
    }

    if (!lastQuotaSummary?.raw) {
        vscode.window.showWarningMessage('No quota response is available yet.');
        return;
    }

    const document = await vscode.workspace.openTextDocument({
        content: JSON.stringify(lastQuotaSummary.raw, null, 2),
        language: 'json'
    });
    await vscode.window.showTextDocument(document, { preview: true });
}

function modelItemsForGroup(models, heading) {
    if (models.length === 0) return [];

    return [
        { label: heading, kind: vscode.QuickPickItemKind.Separator },
        ...models.map((model) => ({
            label: `$(sparkle) ${model.label}`,
            description: model.tagTitle
                ? `[${model.tagTitle}] ${model.modelId}`
                : model.modelId,
            detail: `5h remaining: ${model.pct}${model.resetIn ? ` · resets in ${model.resetIn}` : ''}${model.isRecommended ? ' · ★ Recommended' : ''}`
        }))
    ];
}

async function showModelsQuickPick() {
    try {
        const result = await withConnectionRetry((connection) =>
            fetchUserStatus(connection, METADATA)
        );

        const models = result.models || [];
        const geminiModels = models.filter((model) => model.label.toLowerCase().includes('gemini'));
        const otherModels = models.filter((model) => !model.label.toLowerCase().includes('gemini'));
        const items = [];

        if (result.user?.email) {
            const plan = result.user.tierName || result.user.planName || 'Unknown plan';
            items.push({
                label: `Account: ${result.user.email} (${plan})`,
                kind: vscode.QuickPickItemKind.Separator
            });
        }

        items.push(...modelItemsForGroup(geminiModels, 'Gemini models'));
        items.push(...modelItemsForGroup(otherModels, 'Claude / GPT models'));

        if (items.length === 0) {
            vscode.window.showInformationMessage('Antigravity returned no model metadata.');
            return;
        }

        await vscode.window.showQuickPick(items, {
            placeHolder: 'Antigravity model details (GetUserStatus)'
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read Antigravity model details: ${error.message}`);
    }
}

function activate(context) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravityQuota.showDetails';
    statusBarItem.text = '$(sync~spin) Antigravity: loading…';
    statusBarItem.tooltip = 'Click to view Antigravity quota options';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityQuota.refresh', () => updateQuota(true)),
        vscode.commands.registerCommand('antigravityQuota.showDetails', showDetailsQuickPick),
        vscode.commands.registerCommand('antigravityQuota.openModelsTab', openModelsTab),
        vscode.commands.registerCommand('antigravityQuota.showModelBreakdown', showModelsQuickPick),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration('antigravityQuota')) return;
            restartPolling();
            if (lastQuotaSummary) applyQuotaToStatusBar(lastQuotaSummary);
        })
    );

    restartPolling();
    void updateQuota(false);
}

function deactivate() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
    updateInFlight = null;
}

module.exports = {
    activate,
    deactivate
};
