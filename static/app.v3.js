// API base
const API = window.location.origin;

// State
let modelsData = [];
let presetsData = [];

// ── Extra Args Options ────────────────────────────────────────────────────────
const EXTRA_ARGS_OPTIONS = [
    {
        category: 'Performance',
        items: [
            {
                id: 'arg-flash-attn',
                flag: '--flash-attn on',
                label: 'Flash Attention',
                hint: 'Recomendado Qwen3 — economiza VRAM e acelera inferência',
                checked: true,
            },
            {
                id: 'arg-mlock',
                flag: '--mlock',
                label: 'mlock',
                hint: 'Trava modelo na RAM — evita swap em disco',
                checked: false,
            },
            {
                id: 'arg-no-mmap',
                flag: '--no-mmap',
                label: 'no-mmap',
                hint: 'Carrega modelo inteiro na memória (mais rápido após inicialização)',
                checked: false,
            },
        ],
    },
    {
        category: 'KV Cache',
        items: [
            {
                id: 'arg-no-kv-offload',
                flag: '--no-kv-offload',
                label: 'KV na CPU',
                hint: 'Mantém KV cache na RAM em vez de VRAM',
                checked: false,
            },
        ],
    },
    {
        category: 'Batching & Paralelismo',
        items: [
            {
                id: 'arg-cont-batching',
                flag: '--cont-batching',
                label: 'Continuous Batching',
                hint: 'Múltiplos requests simultâneos — recomendado com OpenWebUI',
                checked: true,
            },
        ],
    },
    {
        category: 'Thinking / Reasoning',
        items: [
            {
                id: 'arg-no-context-shift',
                flag: '--no-context-shift',
                label: 'No Context Shift',
                hint: 'Desativa rotação de contexto — mais previsível no Qwen3 thinking',
                checked: false,
            },
        ],
    },
];



// ── Context Stepper ───────────────────────────────────────────────────────────
function stepCtx(delta) {
    const input = document.getElementById('ctx-size');
    const display = document.getElementById('ctx-display');
    if (!input || !display) return;
    let val = parseInt(input.value) || 32768;
    val = Math.max(4096, Math.min(262144, val + delta));
    input.value = val;
    display.textContent = Math.round(val / 1024) + 'k';
}

function renderExtraArgsPanel() {
    const panel = document.getElementById('extra-args-panel');
    panel.innerHTML = EXTRA_ARGS_OPTIONS.map(cat => `
        <div class="arg-category">
            <div class="arg-category-title">${cat.category}</div>
            <div class="arg-items">
                ${cat.items.map(item => `
                    <label class="arg-item${item.checked ? ' arg-checked' : ''}" id="label-${item.id}">
                        <input
                            type="checkbox"
                            id="${item.id}"
                            ${item.checked ? 'checked' : ''}
                            onchange="onArgChange(this, '${item.id}')"
                        >
                        <div class="arg-info">
                            <span class="arg-label">
                                ${item.label}
                                ${item.hasValue ? `
                                    <select id="${item.id}-value" class="arg-value-select" onchange="updatePreview()">
                                        ${item.values.map(v => `
                                            <option value="${v}" ${v === item.defaultValue ? 'selected' : ''}>${v}</option>
                                        `).join('')}
                                    </select>
                                ` : ''}
                            </span>
                            <span class="arg-hint">${item.hint}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    document.getElementById('extra-args-custom').addEventListener('input', updatePreview);
    updatePreview();
}

function onArgChange(checkbox, itemId) {
    const label = document.getElementById('label-' + itemId);
    if (label) label.classList.toggle('arg-checked', checkbox.checked);
    updatePreview();
}

function buildExtraArgs() {
    const parts = [];

    // Default sampling params for thinking models (general tasks)
    parts.push(
        '--temp', '1.0',
        '--top-p', '0.95',
        '--top-k', '20',
        '--min-p', '0.0',
        '--presence-penalty', '1.5',
        '--repeat-penalty', '1.0',
        '--cache-type-k', 'q8_0',
        '--cache-type-v', 'q8_0'
    );

    const thinkingMode = document.getElementById('thinking-mode')?.value || 'auto';
    if (thinkingMode === 'on') {
        parts.push(`--chat-template-kwargs '{"enable_thinking":true}'`);
    } else if (thinkingMode === 'off') {
        parts.push(`--chat-template-kwargs '{"enable_thinking":false}'`);
    }

    for (const cat of EXTRA_ARGS_OPTIONS) {
        for (const item of cat.items) {
            const cb = document.getElementById(item.id);
            if (cb && cb.checked) {
                parts.push(item.flag);
                if (item.hasValue) {
                    const sel = document.getElementById(item.id + '-value');
                    if (sel) parts.push(sel.value);
                }
            }
        }
    }
    const custom = (document.getElementById('extra-args-custom').value || '').trim();
    if (custom) parts.push(custom);
    return parts.join(' ');
}

function restoreExtraArgs(str) {
    let raw = (str || '').trim();
    const thinkingSelect = document.getElementById('thinking-mode');
    if (thinkingSelect) thinkingSelect.value = 'auto';

    if (raw.includes(`--chat-template-kwargs '{"enable_thinking":false}'`)) {
        if (thinkingSelect) thinkingSelect.value = 'off';
        raw = raw.replace(`--chat-template-kwargs '{"enable_thinking":false}'`, '').trim();
    } else if (raw.includes(`--chat-template-kwargs '{"enable_thinking":true}'`)) {
        if (thinkingSelect) thinkingSelect.value = 'on';
        raw = raw.replace(`--chat-template-kwargs '{"enable_thinking":true}'`, '').trim();
    }

    const tokens = raw.split(/\s+/).filter(Boolean);
    const consumed = new Set();

    for (const cat of EXTRA_ARGS_OPTIONS) {
        for (const item of cat.items) {
            const cb = document.getElementById(item.id);
            if (!cb) continue;
            const idx = tokens.indexOf(item.flag);
            if (idx !== -1) {
                cb.checked = true;
                consumed.add(item.flag);
                const label = document.getElementById('label-' + item.id);
                if (label) label.classList.add('arg-checked');
                if (item.hasValue && idx + 1 < tokens.length) {
                    const sel = document.getElementById(item.id + '-value');
                    if (sel) {
                        sel.value = tokens[idx + 1];
                        consumed.add(tokens[idx + 1]);
                    }
                }
            } else {
                cb.checked = false;
                const label = document.getElementById('label-' + item.id);
                if (label) label.classList.remove('arg-checked');
            }
        }
    }

    // Remaining unknown tokens → custom field
    const leftovers = tokens.filter(t => !consumed.has(t));
    const customField = document.getElementById('extra-args-custom');
    if (customField) customField.value = leftovers.join(' ');

    updatePreview();
}

function updatePreview() {
    const val = buildExtraArgs();
    const preview = document.getElementById('extra-args-preview');
    if (!preview) return;
    if (val) {
        preview.textContent = val;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderExtraArgsPanel();
    refreshAll();
    setupEventListeners();
    loadOpenWebUIUrl();
});

function setupEventListeners() {
    document.getElementById('use-rpc').addEventListener('change', (e) => {
        document.getElementById('rpc-servers-group').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('host-select').addEventListener('change', (e) => {
        const modelId = document.getElementById('model-select').value;
        if (modelId) {
            const model = modelsData.find(m => m.id === modelId);
            if (model) autoConfigureRPC(model);
        }
    });
}

async function refreshAll() {
    await Promise.all([
        loadGPUs(),
        loadServerStatus(),
        loadRpcStatus(),
        loadModels(),
        loadPresets(),
    ]);
}

function formatError(err) {
    let msg = err?.message || String(err || 'Erro desconhecido');
    try {
        const parsed = JSON.parse(msg);
        if (parsed.reason) msg = parsed.reason + (parsed.log_tail ? `\n\nLog:\n${parsed.log_tail.slice(-900)}` : '');
    } catch (_) {}
    return msg;
}

function showToast(message, type = 'success', ms = 5000) {
    const toast = document.getElementById('toast');
    toast.textContent = typeof message === 'string' ? message : JSON.stringify(message);
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), ms);
}

async function apiGet(path) {
    try {
        const res = await fetch(`${API}${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error(`GET ${path} failed:`, err);
        throw err;
    }
}

async function apiPost(path, body) {
    try {
        const res = await fetch(`${API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(typeof data.detail === 'object' ? JSON.stringify(data.detail) : (data.detail || `HTTP ${res.status}`));
        }
        return await res.json();
    } catch (err) {
        console.error(`POST ${path} failed:`, err);
        throw err;
    }
}

async function apiDelete(path) {
    try {
        const res = await fetch(`${API}${path}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error(`DELETE ${path} failed:`, err);
        throw err;
    }
}

// ── GPUs ──────────────────────────────────────────────────────────────────────
async function loadGPUs() {
    try {
        const gpus = await apiGet('/api/gpus');
        renderGPUs(gpus);
    } catch (err) {
        document.getElementById('gpu-grid').innerHTML = '<p class="loading">Erro ao carregar GPUs</p>';
    }
}

function renderGPUs(gpus) {
    const container = document.getElementById('gpu-grid');
    if (!gpus || gpus.length === 0) {
        container.innerHTML = '<p class="loading">Nenhuma GPU encontrada</p>';
        return;
    }

    container.innerHTML = gpus.map(gpu => {
        if (gpu.error) {
            return `<div class="gpu-card">
                <div class="gpu-header">
                    <span class="gpu-name">${gpu.host}</span>
                    <span class="gpu-host">offline</span>
                </div>
                <p style="color:var(--danger);font-size:12px">${gpu.error}</p>
            </div>`;
        }

        const memPct = (gpu.memory_used / gpu.memory_total * 100).toFixed(1);
        const utilPct = gpu.utilization.toFixed(0);
        const memColor = memPct > 90 ? 'red' : memPct > 70 ? 'yellow' : 'green';
        const utilColor = utilPct > 90 ? 'red' : utilPct > 70 ? 'yellow' : 'green';

        return `<div class="gpu-card">
            <div class="gpu-header">
                <span class="gpu-name">${gpu.name}</span>
                <span class="gpu-host">${gpu.host} #${gpu.index}</span>
            </div>
            <div style="margin-bottom:10px">
                <div class="gpu-stats">
                    <span>VRAM</span>
                    <span>${gpu.memory_used.toFixed(0)} / ${gpu.memory_total.toFixed(0)} MB (${memPct}%)</span>
                </div>
                <div class="gpu-bar-bg">
                    <div class="gpu-bar ${memColor}" style="width:${memPct}%"></div>
                </div>
            </div>
            <div>
                <div class="gpu-stats">
                    <span>Utilizacao</span>
                    <span>${utilPct}%</span>
                </div>
                <div class="gpu-bar-bg">
                    <div class="gpu-bar ${utilColor}" style="width:${utilPct}%"></div>
                </div>
            </div>
            <div class="gpu-stats" style="margin-top:8px">
                <span>Temp: ${gpu.temp.toFixed(0)}C</span>
                <span>Power: ${gpu.power.toFixed(0)}W</span>
            </div>
        </div>`;
    }).join('');
}

// ── Server Status ─────────────────────────────────────────────────────────────
async function loadServerStatus() {
    try {
        const status = await apiGet('/api/status');
        renderServerStatus(status);
    } catch (err) {
        document.getElementById('server-status').innerHTML = '<p class="loading">Erro ao carregar status</p>';
    }
}

function renderServerStatus(status) {
    const container = document.getElementById('server-status');
    const hosts = Object.entries(status);

    container.innerHTML = hosts.map(([host, info]) => {
        const isRunning = info.running;
        const isReady = info.status === 'ready';
        const isStarting = info.status === 'starting';
        const dotClass = isReady ? 'running' : isStarting ? 'starting' : '';
        const statusText = isReady ? 'Pronto' : isStarting ? 'Carregando...' : 'Parado';
        const failureHtml = info.last_error ? `<div class="failure-box"><strong>Aviso:</strong> ${info.last_error}<details><summary>log</summary><pre>${(info.log_tail || '').slice(-1200)}</pre></details></div>` : '';

        return `<div class="server-card">
            <div class="server-info">
                <h3>
                    <span class="status-indicator">
                        <span class="status-dot ${dotClass}"></span>
                        ${host}
                    </span>
                </h3>
                <p>${isRunning ? `${statusText}: ${info.model} (porta ${info.port})` : 'Parado'}</p>
                ${failureHtml}
            </div>
            <div class="server-actions">
                ${isRunning
                    ? `<button onclick="unloadModel('${host}')" class="btn btn-danger">Descarregar</button>`
                    : `<span style="color:var(--text-muted);font-size:12px">Pronto</span>`
                }
            </div>
        </div>`;
    }).join('');
}

async function unloadModel(host) {
    try {
        await apiPost('/api/unload', { host });
        showToast(`Modelo descarregado em ${host}`);
        loadServerStatus();
        loadGPUs();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
    }
}

// ── RPC Server ────────────────────────────────────────────────────────────────
async function loadRpcStatus() {
    const container = document.getElementById('rpc-status');
    if (!container) return;
    try {
        const status = await apiGet('/api/rpc/status');
        container.innerHTML = Object.entries(status).map(([host, info]) => {
            const running = info.running;
            const failureHtml = info.last_error ? `<div class="failure-box"><strong>Última falha:</strong> ${info.last_error}<details><summary>log</summary><pre>${(info.log_tail || '').slice(-1200)}</pre></details></div>` : '';
            return `<div class="server-card">
                <div class="server-info">
                    <h3><span class="status-indicator"><span class="status-dot ${running ? 'running' : ''}"></span>${host}</span></h3>
                    <p>${running ? `RPC ativo na porta ${info.port}` : 'RPC parado'}</p>
                    ${failureHtml}
                </div>
                <div class="server-actions">
                    ${running
                        ? `<button onclick="stopRpc('${host}')" class="btn btn-danger">Parar RPC</button>`
                        : `<button onclick="startRpc('${host}')" class="btn btn-secondary">Rodar RPC</button>`}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p class="loading">Erro ao carregar RPC</p>';
    }
}

async function startRpc(host) {
    try {
        showToast(`Iniciando RPC em ${host}...`);
        await apiPost('/api/rpc/start', { host, port: 50052 });
        showToast(`RPC ativo em ${host}`);
        loadRpcStatus();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
        loadRpcStatus();
    }
}

async function stopRpc(host) {
    try {
        await apiPost('/api/rpc/stop', { host, port: 50052 });
        showToast(`RPC parado em ${host}`);
        loadRpcStatus();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
    }
}

// ── Models ────────────────────────────────────────────────────────────────────
async function loadModels() {
    try {
        const models = await apiGet('/api/models');
        modelsData = models;
        renderModels(models);
        populateModelSelect(models);
    } catch (err) {
        document.getElementById('models-list').innerHTML = '<p class="loading">Erro ao carregar modelos</p>';
    }
}

function renderModels(models) {
    const container = document.getElementById('models-list');
    if (!models || models.length === 0) {
        container.innerHTML = '<p class="loading">Nenhum modelo encontrado</p>';
        return;
    }

    container.innerHTML = `<table class="models-table">
        <thead>
            <tr>
                <th>Nome</th>
                <th>Host</th>
                <th>Tamanho</th>
                <th>Quant</th>
                <th>Acao</th>
            </tr>
        </thead>
        <tbody>
            ${models.map(m => {
                const quantClass = m.quantization.toLowerCase().includes('q4') || m.quantization.toLowerCase().includes('q5')
                    ? 'quant-q4' : m.quantization.toLowerCase().includes('q8')
                    ? 'quant-q8' : 'quant-fp';
                return `<tr>
                    <td>
                        <div class="model-name">${m.name}</div>
                        <div class="model-meta">${m.path}</div>
                    </td>
                    <td><span class="badge">${m.host}</span></td>
                    <td>${m.size}</td>
                    <td><span class="badge ${quantClass}">${m.quantization}</span></td>
                    <td>
                        <button onclick="quickLoad('${m.id}')" class="btn btn-small btn-primary">Carregar</button>
                    </td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>`;
}

function populateModelSelect(models) {
    const select = document.getElementById('model-select');
    select.innerHTML = '<option value="">Selecione...</option>' +
        models.map(m => `<option value="${m.id}">${m.host} - ${m.name}</option>`).join('');
}

function quickLoad(modelId) {
    const model = modelsData.find(m => m.id === modelId);
    if (!model) return;

    document.getElementById('model-select').value = modelId;
    document.getElementById('host-select').value = model.host;
    autoConfigureRPC(model);

    document.getElementById('load-form').scrollIntoView({ behavior: 'smooth' });
    showToast('Modelo selecionado. RPC auto-configurado para usar 4 GPUs.');
}

function autoConfigureRPC(model) {
    const useRpcCheckbox = document.getElementById('use-rpc');
    const rpcServersGroup = document.getElementById('rpc-servers-group');
    const rpcServersInput = document.getElementById('rpc-servers');

    const otherHost = model.host === 'monstrinho' ? 'monstro' : 'monstrinho';
    const otherHostIP = otherHost === 'monstro' ? '100.114.126.67:50052' : '100.118.56.76:50052';

    const modelSizeGb = parseFloat(model.size.replace(',', '.').replace('G', '').replace('M', '')) || 0;
    const isLarge = modelSizeGb > 10 || model.name.includes('70b') || model.name.includes('65b');

    if (isLarge) {
        useRpcCheckbox.checked = true;
        rpcServersGroup.style.display = 'block';
        rpcServersInput.value = otherHostIP;
    } else {
        useRpcCheckbox.checked = false;
        rpcServersGroup.style.display = 'none';
    }
}

// ── Load Model ────────────────────────────────────────────────────────────────
async function loadModel(event) {
    event.preventDefault();

    const modelId = document.getElementById('model-select').value;
    if (!modelId) { showToast('Selecione um modelo', 'error'); return false; }

    const model = modelsData.find(m => m.id === modelId);
    if (!model) { showToast('Modelo nao encontrado', 'error'); return false; }

    const config = {
        model_path: model.path,
        host: document.getElementById('host-select').value,
        ctx_size: parseInt(document.getElementById('ctx-size').value),
        threads: parseInt(document.getElementById('threads').value),
        n_gpu_layers: parseInt(document.getElementById('n-gpu-layers').value),
        port: parseInt(document.getElementById('port').value),
        use_rpc: document.getElementById('use-rpc').checked,
        rpc_servers: document.getElementById('rpc-servers').value,
        extra_args: buildExtraArgs(),
    };

    try {
        showToast('Iniciando llama-server...');
        await apiPost('/api/load', config);
        showToast('Modelo carregado com sucesso!');
        loadServerStatus();
        loadGPUs();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
    }

    return false;
}

// ── Presets ───────────────────────────────────────────────────────────────────
async function loadPresets() {
    try {
        const presets = await apiGet('/api/presets');
        presetsData = presets;
        renderPresets(presets);
    } catch (err) {
        document.getElementById('presets-list').innerHTML = '<p class="loading">Erro ao carregar presets</p>';
    }
}

function renderPresets(presets) {
    const container = document.getElementById('presets-list');
    if (!presets || presets.length === 0) {
        container.innerHTML = '<p class="loading">Nenhum preset salvo</p>';
        return;
    }

    container.innerHTML = presets.map(p => {
        const cfg = p.config;
        return `<div class="preset-item" onclick="applyPreset('${p.name}')">
            <div>
                <div class="preset-name">${p.name}</div>
                <div class="preset-meta">${cfg.host} | ctx:${cfg.ctx_size} | ng:${cfg.n_gpu_layers}</div>
            </div>
            <div class="preset-actions" onclick="event.stopPropagation()">
                <button onclick="deletePreset('${p.name}')" class="btn btn-small btn-danger">X</button>
            </div>
        </div>`;
    }).join('');
}

function applyPreset(name) {
    const preset = presetsData.find(p => p.name === name);
    if (!preset) return;

    const cfg = preset.config;
    document.getElementById('host-select').value = cfg.host || 'monstrinho';
    document.getElementById('ctx-size').value = cfg.ctx_size || 4096;
    document.getElementById('threads').value = cfg.threads || 6;
    document.getElementById('n-gpu-layers').value = cfg.n_gpu_layers !== undefined ? cfg.n_gpu_layers : -1;
    document.getElementById('port').value = cfg.port || 8080;
    document.getElementById('use-rpc').checked = cfg.use_rpc || false;
    document.getElementById('rpc-servers').value = cfg.rpc_servers || '100.118.56.76:50052';
    document.getElementById('rpc-servers-group').style.display = cfg.use_rpc ? 'block' : 'none';
    document.getElementById('thinking-mode').value = 'auto';

    restoreExtraArgs(cfg.extra_args || '');

    showToast(`Preset "${name}" aplicado. Selecione o modelo e clique em Carregar.`);
}

async function savePresetPrompt() {
    const name = prompt('Nome do preset:');
    if (!name) return;

    const config = {
        host: document.getElementById('host-select').value,
        ctx_size: parseInt(document.getElementById('ctx-size').value),
        threads: parseInt(document.getElementById('threads').value),
        n_gpu_layers: parseInt(document.getElementById('n-gpu-layers').value),
        port: parseInt(document.getElementById('port').value),
        use_rpc: document.getElementById('use-rpc').checked,
        rpc_servers: document.getElementById('rpc-servers').value,
        extra_args: buildExtraArgs(),
    };

    try {
        await apiPost('/api/presets', { name, config });
        showToast(`Preset "${name}" salvo!`);
        loadPresets();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
    }
}

async function deletePreset(name) {
    if (!confirm(`Excluir preset "${name}"?`)) return;
    try {
        await apiDelete(`/api/presets/${encodeURIComponent(name)}`);
        showToast('Preset excluido');
        loadPresets();
    } catch (err) {
        showToast(formatError(err), 'error', 12000);
    }
}

// ── OpenWebUI ─────────────────────────────────────────────────────────────────
async function loadOpenWebUIUrl() {
    try {
        const data = await apiGet('/api/openwebui');
        document.getElementById('openwebui-link').href = data.url;
    } catch (err) {
        console.log('OpenWebUI URL not available');
    }
}

// Auto-refresh every 10s
setInterval(() => {
    loadGPUs();
    loadServerStatus();
    loadRpcStatus();
}, 10000);
