const { exec } = require('child_process');
const http = require('http');

let cachedConnection = null;

function execAsync(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

async function findProcesses() {
    const candidates = [];

    if (process.platform === 'win32') {
        try {
            const command = 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like \'language_server*\' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"';
            const stdout = await execAsync(command);
            const parsed = JSON.parse(stdout.trim() || '[]');
            const rows = Array.isArray(parsed) ? parsed : [parsed];

            for (const row of rows) {
                if (row?.ProcessId && row?.CommandLine) {
                    candidates.push({ pid: Number(row.ProcessId), commandLine: row.CommandLine });
                }
            }
        } catch (_) {
            // Antigravity currently ships on systems where PowerShell is normally available.
            // Return no candidates rather than guessing from unrelated processes.
        }

        return candidates;
    }

    try {
        const stdout = await execAsync('ps -ww -eo pid=,command= 2>/dev/null || ps -ef');
        for (const line of stdout.split('\n')) {
            if (!line.includes('language_server') || !line.includes('--csrf_token')) continue;

            const match = line.trim().match(/^(\d+)\s+(.*)$/);
            if (match) {
                candidates.push({
                    pid: Number.parseInt(match[1], 10),
                    commandLine: match[2]
                });
            }
        }
    } catch (_) {
        // Discovery failure is surfaced later as a user-friendly connection error.
    }

    return candidates;
}

function extractCsrfToken(commandLine) {
    const match = commandLine.match(/--csrf_token(?:=|\s+)([^\s"']+)/i);
    return match?.[1] || null;
}

function looksLikeAntigravity(commandLine) {
    const normalized = commandLine.toLowerCase();
    return normalized.includes('language_server') &&
        normalized.includes('--csrf_token') &&
        (normalized.includes('antigravity') || normalized.includes('--app_data_dir'));
}

async function findPortsForProcess(pid) {
    const ports = new Set();

    if (process.platform === 'win32') {
        try {
            const stdout = await execAsync(`powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen | Select-Object -ExpandProperty LocalPort | ConvertTo-Json -Compress"`);
            const parsed = JSON.parse(stdout.trim() || '[]');
            const values = Array.isArray(parsed) ? parsed : [parsed];
            for (const value of values) {
                if (Number.isInteger(value)) ports.add(value);
            }
        } catch (_) {
            try {
                const stdout = await execAsync(`netstat -ano | findstr ${pid}`);
                for (const match of stdout.matchAll(/TCP\s+[^\s]+:(\d+)\s+[^\s]+\s+LISTENING\s+(\d+)/gi)) {
                    if (Number(match[2]) === pid) ports.add(Number(match[1]));
                }
            } catch (_) {}
        }

        return [...ports];
    }

    try {
        const stdout = await execAsync(`lsof -nP -a -p ${pid} -iTCP -sTCP:LISTEN 2>/dev/null`);
        for (const match of stdout.matchAll(/:(\d+)\s+\(LISTEN\)/gi)) {
            ports.add(Number(match[1]));
        }
    } catch (_) {}

    if (ports.size === 0 && process.platform === 'linux') {
        try {
            const stdout = await execAsync(`ss -ltnp 2>/dev/null | grep "pid=${pid},"`);
            for (const line of stdout.split('\n')) {
                const match = line.match(/(?:\[.*\]|[^\s]+):(\d+)\s+/);
                if (match) ports.add(Number(match[1]));
            }
        } catch (_) {}
    }

    return [...ports];
}

function probeConnection(port, csrfToken) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' }
        });

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': csrfToken
            },
            timeout: 1500
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode === 200));
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
        req.write(body);
        req.end();
    });
}

async function discoverLanguageServer() {
    const processes = await findProcesses();
    const preferred = processes.filter((candidate) => looksLikeAntigravity(candidate.commandLine));
    const fallbacks = processes.filter((candidate) => !preferred.includes(candidate));

    for (const candidate of [...preferred, ...fallbacks]) {
        const csrfToken = extractCsrfToken(candidate.commandLine);
        if (!csrfToken) continue;

        const ports = await findPortsForProcess(candidate.pid);
        for (const port of ports) {
            if (await probeConnection(port, csrfToken)) {
                return { port, csrfToken, pid: candidate.pid };
            }
        }
    }

    throw new Error('Unable to find a reachable local Antigravity language server');
}

async function getLanguageServerConnection(forceRediscover = false) {
    if (!forceRediscover && cachedConnection) {
        return cachedConnection;
    }

    cachedConnection = await discoverLanguageServer();
    return cachedConnection;
}

function invalidateLanguageServerConnection() {
    cachedConnection = null;
}

module.exports = {
    getLanguageServerConnection,
    invalidateLanguageServerConnection
};
