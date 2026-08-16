const http = require('http');

const SERVICE_PATH = '/exa.language_server_pb.LanguageServerService';

function rpcRequest(connection, method, payload, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = http.request({
            hostname: '127.0.0.1',
            port: connection.port,
            path: `${SERVICE_PATH}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': connection.csrfToken
            },
            timeout: timeoutMs
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Antigravity RPC ${method} returned HTTP ${res.statusCode}`));
                    return;
                }

                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    reject(new Error(`Antigravity RPC ${method} returned invalid JSON: ${error.message}`));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error(`Antigravity RPC ${method} timed out`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function formatCountdown(targetDate, now = new Date()) {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) {
        return '';
    }

    const diffMs = targetDate.getTime() - now.getTime();
    if (diffMs <= 0) return 'Now';

    const totalMinutes = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(totalHours / 24);

    if (days > 0) return `${days}d ${totalHours % 24}h`;
    if (totalHours > 0) return `${totalHours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatPct(fraction) {
    if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return '—';
    const bounded = Math.min(1, Math.max(0, fraction));
    return `${Math.round(bounded * 100)}%`;
}

function parseBucket(bucket) {
    if (!bucket) return null;

    const resetAt = bucket.resetTime ? new Date(bucket.resetTime) : null;
    return {
        bucketId: bucket.bucketId,
        fraction: bucket.remainingFraction,
        pct: formatPct(bucket.remainingFraction),
        resetAt,
        resetIn: formatCountdown(resetAt),
        description: bucket.description || ''
    };
}

async function fetchQuotaSummary(connection, metadata) {
    const raw = await rpcRequest(connection, 'RetrieveUserQuotaSummary', { metadata });
    const groups = raw?.response?.groups;

    if (!Array.isArray(groups)) {
        throw new Error('RetrieveUserQuotaSummary did not return a quota group list');
    }

    return {
        raw,
        groups: groups.map((group) => ({
            displayName: group.displayName || 'Model group',
            description: group.description || '',
            weekly: parseBucket(group.buckets?.find((bucket) => bucket.window === 'weekly')),
            fiveHour: parseBucket(group.buckets?.find((bucket) => bucket.window === '5h'))
        }))
    };
}

async function fetchUserStatus(connection, metadata) {
    const raw = await rpcRequest(connection, 'GetUserStatus', { metadata });
    const status = raw?.userStatus;

    if (!status) {
        throw new Error('GetUserStatus did not return user status data');
    }

    const clientModels = status?.cascadeModelConfigData?.clientModelConfigs || [];
    const models = clientModels.map((model) => {
        const fraction = model.quotaInfo?.remainingFraction;
        const resetAt = model.quotaInfo?.resetTime ? new Date(model.quotaInfo.resetTime) : null;

        return {
            label: model.label || model.modelId || 'Unknown model',
            modelId: model.modelId || '',
            tagTitle: model.tagTitle || null,
            tagDescription: model.tagDescription || null,
            isRecommended: Boolean(model.isRecommended),
            supportsImages: Boolean(model.supportsImages),
            remainingFraction: typeof fraction === 'number' ? fraction : null,
            pct: formatPct(fraction),
            resetAt,
            resetIn: formatCountdown(resetAt)
        };
    });

    const planInfo = status?.planStatus?.planInfo || {};
    return {
        raw,
        user: {
            name: status.name || '',
            email: status.email || '',
            planName: planInfo.planName || '',
            teamsTier: planInfo.teamsTier,
            availablePromptCredits: status?.planStatus?.availablePromptCredits,
            availableFlowCredits: status?.planStatus?.availableFlowCredits,
            tierName: status?.userTier?.name || ''
        },
        models
    };
}

module.exports = {
    rpcRequest,
    formatCountdown,
    formatPct,
    fetchQuotaSummary,
    fetchUserStatus
};
