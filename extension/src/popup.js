"use strict";
/// <reference types="chrome" />
const MAX_ITEMS_KEY = 'leadsgen:max-capture-items';
const DEFAULT_MAX_ITEMS = '50';
const ALLOWED_MAX_ITEMS = new Set(['20', '50', '100']);
(function () {
    const statusEl = document.getElementById('status');
    const buttonEl = document.getElementById('capture');
    const debugEl = document.getElementById('debug');
    const maxItemsEl = document.getElementById('max-items');
    if (!statusEl || !buttonEl || !maxItemsEl)
        return;
    const maxItemsSelect = maxItemsEl;
    function setStatusText(status) {
        if (!statusEl)
            return;
        if (!status) {
            statusEl.textContent = 'Menunggu session dari dashboard.';
            statusEl.className = 'status status-idle';
            return;
        }
        switch (status.status) {
            case 'idle':
                statusEl.textContent = 'Belum ada session aktif dari dashboard.';
                break;
            case 'pending':
                statusEl.textContent =
                    'Session siap. Buka tab Google Maps hasil pencarian, lalu klik tombol di bawah.';
                break;
            case 'capturing':
                statusEl.textContent = 'Sedang membaca hasil Google Maps...';
                break;
            case 'sent':
                statusEl.textContent =
                    status.message ||
                        (status.summary
                            ? `Selesai. ${status.summary.newLeads} baru, ${status.summary.duplicateLeads} duplikat.`
                            : 'Berhasil kirim ke dashboard.');
                break;
            case 'failed':
                statusEl.textContent = `Gagal: ${status.message || 'unknown'}`;
                break;
            default:
                statusEl.textContent = status.status;
        }
        statusEl.className = 'status status-' + (status.status || 'idle');
    }
    function loadMaxItems() {
        try {
            chrome.storage.local.get(MAX_ITEMS_KEY, (data) => {
                const value = data[MAX_ITEMS_KEY];
                if (typeof value === 'string' && ALLOWED_MAX_ITEMS.has(value)) {
                    maxItemsSelect.value = value;
                    return;
                }
                maxItemsSelect.value = DEFAULT_MAX_ITEMS;
            });
        }
        catch {
            maxItemsSelect.value = DEFAULT_MAX_ITEMS;
        }
    }
    function persistMaxItems(value) {
        if (!ALLOWED_MAX_ITEMS.has(value))
            return;
        try {
            chrome.storage.local.set({ [MAX_ITEMS_KEY]: value });
        }
        catch {
            // ignore storage write failures; default will still work
        }
    }
    function loadDebug() {
        if (!debugEl)
            return;
        try {
            chrome.storage.session.get('leadsgen:last-debug', (data) => {
                const entry = data['leadsgen:last-debug'];
                if (entry && typeof entry === 'object' && 'step' in entry && 'detail' in entry) {
                    debugEl.textContent = `debug: ${entry.step} — ${entry.detail}`;
                }
            });
        }
        catch {
            // storage.session may not be available in some contexts; ignore.
        }
    }
    loadMaxItems();
    maxItemsSelect.addEventListener('change', () => {
        persistMaxItems(maxItemsSelect.value);
    });
    chrome.runtime.sendMessage({ type: 'leadsgen:popup-status' }, (response) => {
        setStatusText(response);
        loadDebug();
    });
    buttonEl.addEventListener('click', () => {
        buttonEl.disabled = true;
        if (statusEl) {
            statusEl.textContent = `Sedang membaca (maks ${maxItemsSelect.value} leads)...`;
            statusEl.className = 'status status-capturing';
        }
        chrome.runtime.sendMessage({ type: 'leadsgen:trigger-capture' }, (response) => {
            setStatusText(response);
            loadDebug();
            buttonEl.disabled = false;
        });
    });
})();
