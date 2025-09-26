let equipmentData = { devices: [] };
let auditLog = JSON.parse(localStorage.getItem('fireEquipmentAuditLog')) || [];
let appSettings = {
    currentSort: { column: null, direction: 'asc' },
    selectedItems: new Set(),
    searchHighlight: false,
    breadcrumbs: []
};
let statusChartInstance = null;
let deviceChartInstance = null;
const statusOptions = ['Запыленность','Критическая запыленность','Отключен','Потеря связи','Нет данных','Исправен'];

function generateId(prefix) {
    let id;
    do {
        id = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    } while (findEquipmentItemById(id) !== null);
    return id;
}

function findEquipmentItemById(id) {
    for (const device of equipmentData.devices) {
        if (device.id === id) return { item: device, parent: null, grandParent: null, type: 'device' };
        for (const line of device.lines) {
            if (line.id === id) return { item: line, parent: device, grandParent: null, type: 'line' };
            for (const eq of line.equipment) {
                if (eq.id === id) return { item: eq, parent: line, grandParent: device, type: 'equipment' };
            }
        }
    }
    return null;
}

function validateAddress(address) { return /^\d+\.\d+$/.test(address); }
function validateZone(zone) { return /^\d+\.\d+$/.test(zone); }
function isValidDate(dateStr) {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d) && d.toISOString().slice(0, 10) === dateStr;
}
function getCurrentDate() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
}

function initializeSampleData() {
    if (equipmentData.devices.length === 0) {
        equipmentData.devices.push({
            id: generateId('device'),
            name: 'Прибор Рубеж-2ОП3',
            expanded: true,
            lines: [{
                id: generateId('line'),
                name: 'АЛС 1',
                expanded: true,
                equipment: [
                    { id: generateId('eq'), name: 'Извещатель ИП 212-64', address: '1.21', zone: '3.3', status: 'Запыленность', lastCheck: '2023-10-15', description: '' },
                    { id: generateId('eq'), name: 'Извещатель ИП 212-45', address: '1.22', zone: '3.3', status: 'Исправен', lastCheck: '2023-11-20', description: 'В серверной' }
                ]
            }]
        });
        addAuditEntry('Инициализация', 'Загружены примеры данных');
    }
}

function updateStatusStyle(selectElement) {
    selectElement.classList.remove('status-исправен','status-запыленность','status-критическая-запыленность','status-отключен','status-потеря-связи','status-нет-данных');
    const status = selectElement.value.toLowerCase().replace(/\s+/g, '-');
    selectElement.classList.add(`status-${status}`);
}

function toggleAddForm() {
    const type = document.getElementById('addType').value;
    document.getElementById('deviceForm').style.display = type === 'device' ? 'block' : 'none';
    document.getElementById('lineForm').style.display = type === 'line' ? 'block' : 'none';
    document.getElementById('equipmentForm').style.display = type === 'equipment' ? 'block' : 'none';
    updateParentSelects();
}

function updateParentSelects() {
    const deviceSelect = document.getElementById('parentDevice');
    const lineSelect = document.getElementById('parentLine');
    deviceSelect.innerHTML = '<option value="">Выберите прибор</option>';
    lineSelect.innerHTML = '<option value="">Выберите линию</option>';
    equipmentData.devices.forEach(device => {
        deviceSelect.innerHTML += `<option value="${device.id}">${device.name}</option>`;
        device.lines.forEach(line => {
            lineSelect.innerHTML += `<option value="${device.id}|${line.id}">${device.name} - ${line.name}</option>`;
        });
    });
}

function addNewDevice() {
    const name = document.getElementById('newDeviceName').value;
    if (!name.trim()) return showToast('Введите название прибора', 'error');
    equipmentData.devices.push({ id: generateId('device'), name, expanded: true, lines: [] });
    document.getElementById('newDeviceName').value = '';
    renderTable(); updateParentSelects(); saveToLocalStorage();
    addAuditEntry('Добавление', `Добавлен прибор: ${name}`);
    showToast(`Прибор "${name}" добавлен`, 'success');
}

function addNewLine() {
    const deviceId = document.getElementById('parentDevice').value;
    const name = document.getElementById('newLineName').value;
    if (!deviceId) return showToast('Выберите прибор', 'error');
    if (!name.trim()) return showToast('Введите название линии', 'error');
    const device = equipmentData.devices.find(d => d.id === deviceId);
    if (device) {
        device.lines.push({ id: generateId('line'), name, expanded: true, equipment: [] });
        document.getElementById('newLineName').value = '';
        renderTable(); updateParentSelects(); saveToLocalStorage();
        addAuditEntry('Добавление', `Добавлена линия: ${name} в прибор ${device.name}`);
        showToast(`Линия "${name}" добавлена`, 'success');
    }
}

function addNewEquipment() {
    const lineValue = document.getElementById('parentLine').value;
    const name = document.getElementById('newEquipmentName').value;
    const address = document.getElementById('newAddress').value;
    const zone = document.getElementById('newZone').value;
    const lastCheck = document.getElementById('newLastCheck').value || getCurrentDate();
    const status = document.getElementById('newStatus').value;
    if (!lineValue) return showToast('Выберите линию', 'error');
    if (!name.trim()) return showToast('Введите название оборудования', 'error');
    if (!validateAddress(address)) return showToast('Адрес должен быть в формате число.число', 'error');
    if (!validateZone(zone)) return showToast('Зона должна быть в формате число.число', 'error');
    const [deviceId, lineId] = lineValue.split('|');
    const device = equipmentData.devices.find(d => d.id === deviceId);
    if (device) {
        const line = device.lines.find(l => l.id === lineId);
        if (line) {
            line.equipment.push({
                id: generateId('eq'),
                name,
                address,
                zone,
                status: status || 'Нет данных',
                lastCheck,
                description: ''
            });
            document.getElementById('newEquipmentName').value = '';
            document.getElementById('newAddress').value = '';
            document.getElementById('newZone').value = '';
            document.getElementById('newLastCheck').value = '';
            document.getElementById('newStatus').value = '';
            renderTable(); saveToLocalStorage();
            addAuditEntry('Добавление', `Добавлено оборудование: ${name} (${address})`);
            showToast(`Оборудование "${name}" добавлено`, 'success');
        }
    }
}

function addEmptyEquipment() {
    if (equipmentData.devices.length === 0) return showToast('Сначала добавьте прибор', 'warning');
    const device = equipmentData.devices[0];
    device.expanded = true;
    if (device.lines.length === 0) {
        device.lines.push({ id: generateId('line'), name: 'АЛС 1', expanded: true, equipment: [] });
    }
    const line = device.lines[0];
    line.expanded = true;
    line.equipment.push({
        id: generateId('eq'),
        name: 'Новое оборудование',
        address: '1.1',
        zone: '1.1',
        status: 'Нет данных',
        lastCheck: getCurrentDate(),
        description: ''
    });
    renderTable(); saveToLocalStorage();
    addAuditEntry('Добавление', 'Добавлено новое оборудование');
    showToast('Новое оборудование добавлено', 'success');
}

function deleteItem(id, type, name) {
    let message = `Вы уверены, что хотите удалить ${type} "${name}"?`;
    if (type === 'device') {
        const device = equipmentData.devices.find(d => d.id === id);
        if (device) message += ` Это удалит ${device.lines.length} линий и ${device.lines.reduce((s,l)=>s+l.equipment.length,0)} единиц оборудования.`;
    } else if (type === 'line') {
        for (const d of equipmentData.devices) {
            const l = d.lines.find(li => li.id === id);
            if (l) { message += ` Это удалит ${l.equipment.length} единиц оборудования.`; break; }
        }
    }
    if (confirm(message)) {
        if (type === 'device') equipmentData.devices = equipmentData.devices.filter(d => d.id !== id);
        else if (type === 'line') equipmentData.devices.forEach(d => d.lines = d.lines.filter(l => l.id !== id));
        else equipmentData.devices.forEach(d => d.lines.forEach(l => l.equipment = l.equipment.filter(e => e.id !== id)));
        renderTable(); updateParentSelects(); saveToLocalStorage();
        addAuditEntry('Удаление', `Удален ${type}: ${name}`);
        showToast(`"${name}" удален`, 'success');
    }
}

function toggleVisibility(id, type) {
    if (type === 'device') {
        const d = equipmentData.devices.find(x => x.id === id);
        if (d) d.expanded = !d.expanded;
    } else {
        equipmentData.devices.forEach(d => {
            const l = d.lines.find(x => x.id === id);
            if (l) l.expanded = !l.expanded;
        });
    }
    renderTable();
}

function expandAll() {
    equipmentData.devices.forEach(d => { d.expanded = true; d.lines.forEach(l => l.expanded = true); });
    renderTable();
}

function collapseAll() {
    equipmentData.devices.forEach(d => { d.expanded = false; d.lines.forEach(l => l.expanded = false); });
    renderTable();
}

function clearAll() {
    if (confirm('Удалить ВСЕ данные? Это нельзя отменить.')) {
        equipmentData.devices = [];
        renderTable(); updateParentSelects(); saveToLocalStorage();
        addAuditEntry('Система', 'Все данные очищены');
        showToast('Все данные очищены', 'warning');
    }
}

function exportToExcel() {
    setLoadingState(true);
    try {
        const wsData = [["Прибор","Линия АЛС","Оборудование","Адрес","Зона","Состояние","Дата проверки","Описание"]];
        equipmentData.devices.forEach(device => {
            device.lines.forEach(line => {
                line.equipment.forEach(eq => {
                    wsData.push([device.name, line.name, eq.name, eq.address, eq.zone, eq.status, eq.lastCheck, eq.description]);
                });
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Оборудование");
        const colWidths = wsData[0].map((_, i) => Math.max(...wsData.map(r => (r[i]?.toString().length || 10))) + 2);
        ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w, 30) }));
        XLSX.writeFile(wb, "пожарное_оборудование.xlsx");
        addAuditEntry('Экспорт', 'Данные экспортированы в Excel (.xlsx)');
        showToast('Данные сохранены в Excel', 'success');
    } catch (error) {
        console.error('Ошибка экспорта Excel:', error);
        showToast('Ошибка экспорта в Excel', 'error');
    } finally {
        setLoadingState(false);
    }
}

function exportJSON() {
    setLoadingState(true);
    try {
        const dataStr = JSON.stringify(equipmentData, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'пожарное_оборудование.json';
        a.click();
        URL.revokeObjectURL(url);
        addAuditEntry('Экспорт', 'Данные экспортированы в JSON');
        showToast('Данные экспортированы в JSON', 'success');
    } catch (error) {
        console.error('Ошибка экспорта JSON:', error);
        showToast('Ошибка экспорта в JSON', 'error');
    } finally {
        setLoadingState(false);
    }
}

function importJSON() {
    document.getElementById('fileInput').click();
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoadingState(true);
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.devices && Array.isArray(data.devices)) {
                equipmentData = data;
                renderTable(); updateParentSelects(); saveToLocalStorage();
                addAuditEntry('Импорт', 'Данные импортированы из JSON');
                showToast('Данные успешно импортированы', 'success');
            } else throw new Error('Неверная структура');
        } catch (err) {
            console.error(err);
            showToast('Ошибка импорта: ' + err.message, 'error');
        } finally {
            e.target.value = '';
            setLoadingState(false);
        }
    };
    reader.readAsText(file);
});

function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    appSettings.searchHighlight = searchTerm.length > 0;
    const allRows = [];
    for (const device of equipmentData.devices) {
        allRows.push({
            type: 'device',
            id: device.id,
            name: device.name,
            expanded: device.expanded,
            data: device
        });
        for (const line of device.lines) {
            allRows.push({
                type: 'line',
                id: line.id,
                name: line.name,
                deviceId: device.id,
                expanded: line.expanded,
                data: line
            });
            for (const eq of line.equipment) {
                allRows.push({
                    type: 'equipment',
                    id: eq.id,
                    name: eq.name,
                    deviceId: device.id,
                    lineId: line.id,
                    data: eq
                });
            }
        }
    }
    const filteredRows = allRows.filter(row => {
        if (row.type === 'equipment') {
            const matchesSearch = searchTerm === '' ||
                (row.data.name && row.data.name.toLowerCase().includes(searchTerm)) ||
                (row.data.address && row.data.address.toLowerCase().includes(searchTerm)) ||
                (row.data.zone && row.data.zone.toLowerCase().includes(searchTerm)) ||
                (row.data.description && row.data.description.toLowerCase().includes(searchTerm));
            const matchesStatus = statusFilter === '' || row.data.status === statusFilter;
            return matchesSearch && matchesStatus;
        } else {
            return searchTerm === '' || (row.name && row.name.toLowerCase().includes(searchTerm));
        }
    });
    const visibleDevices = new Set();
    const visibleLines = new Set();
    filteredRows.forEach(row => {
        if (row.type === 'device') visibleDevices.add(row.id);
        if (row.type === 'line') visibleLines.add(row.id);
    });
    filteredRows.forEach(row => {
        if (row.type === 'equipment') {
            visibleDevices.add(row.deviceId);
            visibleLines.add(row.lineId);
        }
    });
    let visibleEquipmentCount = 0;
    const visibleStatusCount = {};
    filteredRows.forEach(row => {
        if (row.type === 'equipment') {
            visibleEquipmentCount++;
            visibleStatusCount[row.data.status] = (visibleStatusCount[row.data.status] || 0) + 1;
        }
    });
    window.visibleStats = {
        total: visibleEquipmentCount,
        ...visibleStatusCount
    };
    for (const device of equipmentData.devices) {
        if (!visibleDevices.has(device.id)) continue;
        const deviceRow = document.createElement('tr');
        deviceRow.className = 'device-row';
        deviceRow.dataset.id = device.id;
        deviceRow.dataset.type = 'device';
        const deviceNameCell = document.createElement('td');
        deviceNameCell.className = 'level-0 editable';
        deviceNameCell.contentEditable = true;
        deviceNameCell.onblur = function() { updateName(device.id, 'device', this.textContent); };
        deviceNameCell.innerHTML = highlightText(device.name, searchTerm);
        deviceRow.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-id="${device.id}" data-type="device"></td>
            <td><button class="toggle-btn" onclick="toggleVisibility('${device.id}', 'device')"><i class="fas fa-${device.expanded ? 'minus' : 'plus'}"></i></button></td>
        `;
        deviceRow.appendChild(deviceNameCell);
        deviceRow.innerHTML += `
            <td colspan="4"></td>
            <td><button class="delete-btn" onclick="deleteItem('${device.id}', 'device', '${device.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(deviceRow);
        if (device.expanded) {
            for (const line of device.lines) {
                if (!visibleLines.has(line.id)) continue;
                const lineRow = document.createElement('tr');
                lineRow.className = 'line-row';
                lineRow.dataset.id = line.id;
                lineRow.dataset.type = 'line';
                const lineNameCell = document.createElement('td');
                lineNameCell.className = 'level-1 editable';
                lineNameCell.contentEditable = true;
                lineNameCell.onblur = function() { updateName(line.id, 'line', this.textContent); };
                lineNameCell.innerHTML = highlightText(line.name, searchTerm);
                lineRow.innerHTML = `
                    <td><input type="checkbox" class="row-checkbox" data-id="${line.id}" data-type="line"></td>
                    <td><button class="toggle-btn" onclick="toggleVisibility('${line.id}', 'line')"><i class="fas fa-${line.expanded ? 'minus' : 'plus'}"></i></button></td>
                `;
                lineRow.appendChild(lineNameCell);
                lineRow.innerHTML += `
                    <td colspan="4"></td>
                    <td><button class="delete-btn" onclick="deleteItem('${line.id}', 'line', '${line.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button></td>
                `;
                tbody.appendChild(lineRow);
                if (line.expanded) {
                    for (const eq of line.equipment) {
                        const shouldShowEquipment = filteredRows.some(r => r.type === 'equipment' && r.id === eq.id);
                        if (!shouldShowEquipment) continue;
                        const eqRow = document.createElement('tr');
                        eqRow.dataset.id = eq.id;
                        eqRow.dataset.type = 'equipment';
                        const hasDesc = eq.description && eq.description.trim() !== '';
                        const eqNameCell = document.createElement('td');
                        eqNameCell.className = 'level-2 editable';
                        eqNameCell.contentEditable = true;
                        eqNameCell.onblur = function() { updateName(eq.id, 'equipment', this.textContent); };
                        eqNameCell.innerHTML = highlightText(eq.name, searchTerm) + (hasDesc ? `<i class="fas fa-sticky-note" style="color:#6c757d;margin-left:5px;" title="Описание: ${eq.description.replace(/"/g, '&quot;')}"></i>` : '');
                        eqRow.innerHTML = `
                            <td><input type="checkbox" class="row-checkbox" data-id="${eq.id}" data-type="equipment"></td>
                            <td></td>
                        `;
                        eqRow.appendChild(eqNameCell);
                        eqRow.innerHTML += `
                            <td class="editable" contenteditable="true" title="Формат: число.число">${highlightText(eq.address, searchTerm)}</td>
                            <td class="editable" contenteditable="true" title="Формат: число.число">${highlightText(eq.zone, searchTerm)}</td>
                            <td>
                                <select class="status-select">
                                    <option value="Запыленность" ${eq.status === 'Запыленность' ? 'selected' : ''}>Запыленность</option>
                                    <option value="Критическая запыленность" ${eq.status === 'Критическая запыленность' ? 'selected' : ''}>Критическая запыленность</option>
                                    <option value="Отключен" ${eq.status === 'Отключен' ? 'selected' : ''}>Отключен</option>
                                    <option value="Потеря связи" ${eq.status === 'Потеря связи' ? 'selected' : ''}>Потеря связи</option>
                                    <option value="Нет данных" ${eq.status === 'Нет данных' ? 'selected' : ''}>Нет данных</option>
                                    <option value="Исправен" ${eq.status === 'Исправен' ? 'selected' : ''}>Исправен</option>
                                </select>
                            </td>
                            <td class="editable" contenteditable="true">${highlightText(eq.lastCheck, searchTerm)}</td>
                            <td><button class="delete-btn" onclick="deleteItem('${eq.id}', 'equipment', '${eq.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button></td>
                        `;
                        const cells = eqRow.querySelectorAll('td:not(:first-child):not(:nth-child(2)):not(:last-child)');
                        cells.forEach(cell => {
                            cell.addEventListener('contextmenu', (ev) => {
                                showContextMenu(ev, eq.id, 'equipment', eq.name, eq.address, eq.description);
                            });
                        });
                        tbody.appendChild(eqRow);
                    }
                }
            }
        }
    }
    document.querySelectorAll('.status-select').forEach(el => {
        el.onchange = function() { updateStatus(this.closest('tr').dataset.id, this.value); updateStatusStyle(this); };
        updateStatusStyle(el);
    });
    document.querySelectorAll('.editable[contenteditable="true"]').forEach(el => {
        if (el.previousElementSibling?.textContent?.includes('Адрес')) {
            el.onblur = function() { updateAddress(this.closest('tr').dataset.id, this.textContent); };
        } else if (el.previousElementSibling?.textContent?.includes('Зона')) {
            el.onblur = function() { updateZone(this.closest('tr').dataset.id, this.textContent); };
        } else if (el.previousElementSibling?.textContent?.includes('Дата')) {
            el.onblur = function() { updateLastCheck(this.closest('tr').dataset.id, this.textContent); };
        }
    });
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', function() { toggleRowSelection(this); });
    });
    updateStatistics();
}

function showContextMenu(event, id, type, name, address, currentDesc = '') {
    event.preventDefault();
    const menu = document.getElementById('contextMenu');
    menu.innerHTML = '';
    const items = [
        { text: '<i class="fas fa-copy"></i> Скопировать название', action: () => copyToClipboard(name) },
        { text: '<i class="fas fa-copy"></i> Скопировать адрес', action: () => copyToClipboard(address) },
        { separator: true },
        {
            text: `<i class="fas fa-sticky-note"></i> ${currentDesc ? 'Редактировать описание' : 'Добавить описание'}`,
            action: () => editDescription(id, currentDesc)
        },
        { separator: true },
        { text: '<i class="fas fa-mouse-pointer"></i> Выделить', action: () => selectSingleItem(id, type) },
        { text: '<i class="fas fa-file-excel"></i> Экспорт в Excel', action: exportToExcel },
        { separator: true },
        { text: '<i class="fas fa-trash"></i> Удалить', action: () => deleteItem(id, type, name), class: 'delete-btn' }
    ];
    items.forEach(item => {
        if (item.separator) {
            const hr = document.createElement('hr');
            menu.appendChild(hr);
        } else {
            const btn = document.createElement('button');
            btn.innerHTML = item.text;
            if (item.class) btn.className = item.class;
            btn.onclick = () => { menu.style.display = 'none'; item.action(); };
            menu.appendChild(btn);
        }
    });
    menu.style.display = 'flex';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
}

function editDescription(eqId, currentDesc) {
    const newDesc = prompt('Описание оборудования:', currentDesc || '');
    if (newDesc !== null) {
        for (const d of equipmentData.devices) {
            for (const l of d.lines) {
                const eq = l.equipment.find(e => e.id === eqId);
                if (eq) {
                    eq.description = newDesc;
                    saveToLocalStorage();
                    addAuditEntry('Описание', `Обновлено описание для ${eq.name}`);
                    showToast('Описание сохранено', 'success');
                    renderTable();
                    return;
                }
            }
        }
    }
}

document.addEventListener('click', () => document.getElementById('contextMenu').style.display = 'none');

function saveToLocalStorage() {
    localStorage.setItem('fireEquipmentData', JSON.stringify(equipmentData));
    localStorage.setItem('fireEquipmentAuditLog', JSON.stringify(auditLog));
}

function loadFromLocalStorage() {
    setLoadingState(true);
    try {
        const data = localStorage.getItem('fireEquipmentData');
        if (data) try { equipmentData = JSON.parse(data); } catch (e) { console.error(e); }
        const log = localStorage.getItem('fireEquipmentAuditLog');
        if (log) try { auditLog = JSON.parse(log); } catch (e) { console.error(e); }
    } finally {
        setLoadingState(false);
    }
}

function addAuditEntry(action, details) {
    auditLog.unshift({ timestamp: new Date().toISOString(), action, details });
    if (auditLog.length > 1000) auditLog = auditLog.slice(0, 1000);
    saveToLocalStorage();
}

function showToast(message, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.className = 'toast ' + type;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function setLoadingState(isLoading) {
    const overlay = document.getElementById('loadingOverlay');
    if (isLoading) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function toggleTheme() {
    const theme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.querySelector('.theme-toggle i').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    showToast(`Тема: ${theme === 'dark' ? 'Тёмная' : 'Светлая'}`, 'info');
}

function applyFilters() { renderTable(); }
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    applyFilters();
    showToast('Фильтры сброшены', 'info');
}

function updateStatistics() {
    const stats = window.visibleStats || { total: 0 };
    const container = document.getElementById('statsDisplay');
    container.innerHTML = '';
    const statusColors = {
        'Исправен': 'var(--success-color)',
        'Запыленность': 'var(--warning-color)',
        'Критическая запыленность': '#ff9800',
        'Отключен': 'var(--danger-color)',
        'Потеря связи': '#6c757d',
        'Нет данных': 'var(--info-color)'
    };
    const items = [
        {label:'Всего', value:stats.total, color:'var(--primary-color)', icon:'fa-fire-extinguisher'},
        {label:'Исправен', value:stats['Исправен'] || 0, color:statusColors['Исправен'], icon:'fa-check-circle'},
        {label:'Запыленность', value:stats['Запыленность'] || 0, color:statusColors['Запыленность'], icon:'fa-exclamation-triangle'},
        {label:'Критическая запыленность', value:stats['Критическая запыленность'] || 0, color:statusColors['Критическая запыленность'], icon:'fa-exclamation-circle'},
        {label:'Отключен', value:stats['Отключен'] || 0, color:statusColors['Отключен'], icon:'fa-power-off'},
        {label:'Потеря связи', value:stats['Потеря связи'] || 0, color:statusColors['Потеря связи'], icon:'fa-wifi'},
        {label:'Нет данных', value:stats['Нет данных'] || 0, color:statusColors['Нет данных'], icon:'fa-question-circle'}
    ];
    items.forEach(i => {
        const el = document.createElement('div');
        el.className = 'stat-item';
        el.style.backgroundColor = i.color;
        el.style.color = 'white';
        el.innerHTML = `<i class="fas ${i.icon}"></i> ${i.label}: ${i.value}`;
        container.appendChild(el);
    });
}

function toggleCharts() {
    const c = document.getElementById('chartsContainer');
    if (c.style.display === 'none') {
        c.style.display = 'grid';
        c.classList.add('show');
        renderCharts();
    } else {
        c.style.display = 'none';
        c.classList.remove('show');
    }
}

function renderCharts() {
    const statusCtx = document.getElementById('statusChart').getContext('2d');
    const deviceCtx = document.getElementById('deviceChart').getContext('2d');
    const statusData = {};
    const deviceData = {};
    for (const device of equipmentData.devices) {
        deviceData[device.name] = 0;
        for (const line of device.lines) {
            for (const eq of line.equipment) {
                statusData[eq.status] = (statusData[eq.status] || 0) + 1;
                deviceData[device.name] = (deviceData[device.name] || 0) + 1;
            }
        }
    }
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }
    if (deviceChartInstance) {
        deviceChartInstance.destroy();
    }
    const statusLabels = Object.keys(statusData);
    const statusColors = {
        'Исправен': 'var(--success-color)',
        'Запыленность': 'var(--warning-color)',
        'Критическая запыленность': '#ff9800',
        'Отключен': 'var(--danger-color)',
        'Потеря связи': '#6c757d',
        'Нет данных': 'var(--info-color)'
    };
    const statusChartColors = statusLabels.map(label => statusColors[label] || '#ccc');
    statusChartInstance = new Chart(statusCtx, {
        type: 'pie',
        data: {
            labels: statusLabels,
            datasets: [{
                data: Object.values(statusData),
                backgroundColor: statusChartColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Распределение по состояниям'
                }
            }
        }
    });
    deviceChartInstance = new Chart(deviceCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(deviceData),
            datasets: [{
                label: 'Количество оборудования',
                data: Object.values(deviceData),
                backgroundColor: '#2E86AB',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Оборудование по приборам'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function highlightText(text, term) {
    if (!term || !appSettings.searchHighlight) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    const fragment = document.createDocumentFragment();
    parts.forEach(part => {
        if (regex.test(part)) {
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = part;
            fragment.appendChild(mark);
        } else {
            fragment.appendChild(document.createTextNode(part));
        }
    });
    return fragment;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Скопировано', 'success'));
}

function selectSingleItem(id, type) {
    clearSelection();
    const cb = document.querySelector(`.row-checkbox[data-id="${id}"][data-type="${type}"]`);
    if (cb) { cb.checked = true; toggleRowSelection(cb); }
}

function toggleSelectAll(checked) {
    document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = checked; toggleRowSelection(cb); });
}

function toggleRowSelection(cb) {
    const row = cb.closest('tr');
    const key = `${row.dataset.type}-${row.dataset.id}`;
    if (cb.checked) {
        appSettings.selectedItems.add(key);
        row.style.backgroundColor = 'rgba(0,123,255,0.1)';
    } else {
        appSettings.selectedItems.delete(key);
        row.style.backgroundColor = '';
    }
    updateBulkActions();
}

function updateBulkActions() {
    const countEl = document.getElementById('selectedCount');
    countEl.textContent = appSettings.selectedItems.size;
    document.getElementById('bulkActions').style.display = appSettings.selectedItems.size ? 'flex' : 'none';
}

function clearSelection() {
    appSettings.selectedItems.clear();
    document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = false; cb.closest('tr').style.backgroundColor = ''; });
    document.getElementById('selectAll').checked = false;
    updateBulkActions();
}

function changeStatusBulk() {
    if (appSettings.selectedItems.size === 0) return;
    let hasEquipment = false;
    for (const item of appSettings.selectedItems) {
        if (item.startsWith('equipment-')) { hasEquipment = true; break; }
    }
    if (!hasEquipment) return showToast('Выберите хотя бы одно оборудование', 'warning');
    const modal = document.createElement('div');
    modal.id = 'bulkStatusModal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;">
            <div style="background:var(--card-bg);padding:20px;border-radius:10px;width:300px;">
                <h3><i class="fas fa-exchange-alt"></i> Изменить статус</h3>
                <select id="bulkStatusInput" style="width:100%;padding:10px;margin:10px 0;">
                    <option value="Исправен">Исправен</option>
                    <option value="Запыленность">Запыленность</option>
                    <option value="Критическая запыленность">Критическая запыленность</option>
                    <option value="Отключен">Отключен</option>
                    <option value="Потеря связи">Потеря связи</option>
                    <option value="Нет данных">Нет данных</option>
                </select>
                <div style="display:flex;justify-content:space-between;margin-top:20px;">
                    <button onclick="applyBulkStatus()"><i class="fas fa-check"></i> Применить</button>
                    <button class="secondary-btn" onclick="document.getElementById('bulkStatusModal').remove()"><i class="fas fa-times"></i> Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function applyBulkStatus() {
    const newStatus = document.getElementById('bulkStatusInput').value;
    let count = 0;
    appSettings.selectedItems.forEach(item => {
        if (item.startsWith('equipment-')) {
            const id = item.split('-')[1];
            for (const d of equipmentData.devices) {
                for (const l of d.lines) {
                    const eq = l.equipment.find(e => e.id === id);
                    if (eq) { eq.status = newStatus; count++; }
                }
            }
        }
    });
    document.getElementById('bulkStatusModal').remove();
    renderTable(); saveToLocalStorage(); clearSelection();
    addAuditEntry('Массовое изменение', `Статус изменен для ${count} элементов`);
    showToast(`Статус изменен для ${count} элементов`, 'success');
}

function changeDateBulk() {
    if (appSettings.selectedItems.size === 0) return;
    let hasEquipment = false;
    for (const item of appSettings.selectedItems) {
        if (item.startsWith('equipment-')) { hasEquipment = true; break; }
    }
    if (!hasEquipment) return showToast('Выберите хотя бы одно оборудование', 'warning');
    const modal = document.createElement('div');
    modal.id = 'bulkDateModal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;">
            <div style="background:var(--card-bg);padding:20px;border-radius:10px;width:300px;">
                <h3><i class="fas fa-calendar-alt"></i> Изменить дату</h3>
                <input type="date" id="bulkDateInput" style="width:100%;padding:10px;margin:10px 0;" value="${getCurrentDate()}">
                <div style="display:flex;justify-content:space-between;margin-top:20px;">
                    <button onclick="applyBulkDate()"><i class="fas fa-check"></i> Применить</button>
                    <button class="secondary-btn" onclick="document.getElementById('bulkDateModal').remove()"><i class="fas fa-times"></i> Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function applyBulkDate() {
    const newDate = document.getElementById('bulkDateInput').value;
    if (!isValidDate(newDate)) return showToast('Неверный формат даты', 'error');
    let count = 0;
    appSettings.selectedItems.forEach(item => {
        if (item.startsWith('equipment-')) {
            const id = item.split('-')[1];
            for (const d of equipmentData.devices) {
                for (const l of d.lines) {
                    const eq = l.equipment.find(e => e.id === id);
                    if (eq) { eq.lastCheck = newDate; count++; }
                }
            }
        }
    });
    document.getElementById('bulkDateModal').remove();
    renderTable(); saveToLocalStorage(); clearSelection();
    addAuditEntry('Массовое изменение', `Дата изменена для ${count} элементов`);
    showToast(`Дата изменена для ${count} элементов`, 'success');
}

function deleteBulk() {
    if (appSettings.selectedItems.size === 0) return;
    if (!confirm(`Удалить ${appSettings.selectedItems.size} выбранных элементов?`)) return;
    let count = 0;
    appSettings.selectedItems.forEach(item => {
        const [type, id] = item.split('-');
        if (type === 'equipment') {
            equipmentData.devices.forEach(d => d.lines.forEach(l => {
                const idx = l.equipment.findIndex(e => e.id === id);
                if (idx !== -1) { l.equipment.splice(idx, 1); count++; }
            }));
        } else if (type === 'line') {
            equipmentData.devices.forEach(d => {
                const idx = d.lines.findIndex(l => l.id === id);
                if (idx !== -1) { count += d.lines[idx].equipment.length; d.lines.splice(idx, 1); }
            });
        } else if (type === 'device') {
            const idx = equipmentData.devices.findIndex(d => d.id === id);
            if (idx !== -1) {
                count += equipmentData.devices[idx].lines.reduce((s,l) => s + l.equipment.length, 0);
                equipmentData.devices.splice(idx, 1);
            }
        }
    });
    renderTable(); updateParentSelects(); saveToLocalStorage(); clearSelection();
    addAuditEntry('Массовое удаление', `Удалено ${count} элементов`);
    showToast(`Удалено ${count} элементов`, 'success');
}

function sortTable(colIdx) {
    const table = document.getElementById('equipmentTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (appSettings.currentSort.column === colIdx) {
        appSettings.currentSort.direction = appSettings.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        appSettings.currentSort.column = colIdx;
        appSettings.currentSort.direction = 'asc';
    }
    document.querySelectorAll('.sort-indicator').forEach(i => i.className = 'fas fa-sort sort-indicator');
    const ind = table.rows[0].cells[colIdx].querySelector('.sort-indicator');
    if (ind) ind.className = `fas fa-sort-${appSettings.currentSort.direction === 'asc' ? 'up' : 'down'} sort-indicator`;
    rows.sort((a, b) => {
        let aVal = a.cells[colIdx]?.textContent.trim() || '';
        let bVal = b.cells[colIdx]?.textContent.trim() || '';
        if (colIdx === 3 || colIdx === 4) {
            aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0;
        }
        if (colIdx === 6) {
            aVal = new Date(aVal) || new Date(0); bVal = new Date(bVal) || new Date(0);
        }
        if (aVal < bVal) return appSettings.currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return appSettings.currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    tbody.innerHTML = '';
    rows.forEach(r => tbody.appendChild(r));
    addAuditEntry('Сортировка', `Сортировка по колонке ${colIdx}`);
}

function updateName(id, type, newName) {
    if (!newName.trim()) { showToast('Имя не может быть пустым', 'error'); renderTable(); return; }
    let oldName = '';
    if (type === 'device') {
        const d = equipmentData.devices.find(x => x.id === id);
        if (d) { oldName = d.name; d.name = newName; }
    } else if (type === 'line') {
        for (const d of equipmentData.devices) {
            const l = d.lines.find(x => x.id === id);
            if (l) { oldName = l.name; l.name = newName; break; }
        }
    } else {
        for (const d of equipmentData.devices) {
            for (const l of d.lines) {
                const eq = l.equipment.find(x => x.id === id);
                if (eq) { oldName = eq.name; eq.name = newName; break; }
            }
        }
    }
    saveToLocalStorage();
    addAuditEntry('Изменение', `Имя ${type} изменено с "${oldName}" на "${newName}"`);
    showToast('Имя сохранено', 'success');
}

function updateAddress(id, newAddr) {
    if (!validateAddress(newAddr)) { showToast('Неверный формат адреса', 'error'); renderTable(); return; }
    for (const d of equipmentData.devices) {
        for (const l of d.lines) {
            const eq = l.equipment.find(x => x.id === id);
            if (eq) { const old = eq.address; eq.address = newAddr; saveToLocalStorage(); addAuditEntry('Изменение', `Адрес изменен с "${old}" на "${newAddr}"`); showToast('Адрес сохранен', 'success'); return; }
        }
    }
}

function updateZone(id, newZone) {
    if (!validateZone(newZone)) { showToast('Неверный формат зоны', 'error'); renderTable(); return; }
    for (const d of equipmentData.devices) {
        for (const l of d.lines) {
            const eq = l.equipment.find(x => x.id === id);
            if (eq) { const old = eq.zone; eq.zone = newZone; saveToLocalStorage(); addAuditEntry('Изменение', `Зона изменена с "${old}" на "${newZone}"`); showToast('Зона сохранена', 'success'); return; }
        }
    }
}

function updateStatus(id, newStatus) {
    for (const d of equipmentData.devices) {
        for (const l of d.lines) {
            const eq = l.equipment.find(x => x.id === id);
            if (eq) { const old = eq.status; eq.status = newStatus; saveToLocalStorage(); addAuditEntry('Изменение', `Статус изменен с "${old}" на "${newStatus}"`); return; }
        }
    }
}

function updateLastCheck(id, newDate) {
    if (newDate && !isValidDate(newDate)) { showToast('Неверный формат даты', 'error'); renderTable(); return; }
    for (const d of equipmentData.devices) {
        for (const l of d.lines) {
            const eq = l.equipment.find(x => x.id === id);
            if (eq) { const old = eq.lastCheck; eq.lastCheck = newDate; saveToLocalStorage(); addAuditEntry('Изменение', `Дата изменена с "${old}" на "${newDate}"`); showToast('Дата сохранена', 'success'); updateStatistics(); return; }
        }
    }
}

function showAuditLog() {
    const modal = document.createElement('div');
    modal.id = 'auditLogModal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;">
            <div style="background:var(--card-bg);padding:20px;border-radius:10px;width:80%;max-width:800px;max-height:80%;overflow:auto;">
                <h3><i class="fas fa-history"></i> Журнал изменений</h3>
                <button class="delete-btn" onclick="clearAuditLogFromModal()" style="margin-bottom:15px;"><i class="fas fa-trash"></i> Очистить журнал</button>
                <div id="auditLogContent" style="max-height:400px;overflow-y:auto;"></div>
                <button class="secondary-btn" onclick="document.getElementById('auditLogModal').remove()" style="margin-top:15px;width:100%;"><i class="fas fa-times"></i> Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const logDiv = document.getElementById('auditLogContent');
    if (auditLog.length === 0) {
        logDiv.innerHTML = '<p>Журнал пуст</p>';
    } else {
        logDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        auditLog.forEach(entry => {
            const date = new Date(entry.timestamp).toLocaleString('ru-RU');
            const div = document.createElement('div');
            div.style.padding = '8px';
            div.style.borderBottom = '1px solid var(--border-color)';
            div.innerHTML = `<strong>${date}</strong> — ${entry.action}: ${entry.details}`;
            fragment.appendChild(div);
        });
        logDiv.appendChild(fragment);
    }
}

function clearAuditLogFromModal() {
    if (confirm('Очистить журнал изменений?')) {
        auditLog = [];
        saveToLocalStorage();
        const logDiv = document.getElementById('auditLogContent');
        logDiv.innerHTML = '<p>Журнал пуст</p>';
        showToast('Журнал очищен', 'success');
    }
}

function clearBreadcrumbs() {
    appSettings.breadcrumbs = [];
    renderTable();
}

function validateAddressField(el) {
    if (el.value && !validateAddress(el.value)) {
        el.classList.add('validation-error');
        setTimeout(() => el.classList.remove('validation-error'), 2000);
    } else {
        el.classList.remove('validation-error');
    }
}

function validateZoneField(el) {
    if (el.value && !validateZone(el.value)) {
        el.classList.add('validation-error');
        setTimeout(() => el.classList.remove('validation-error'), 2000);
    } else {
        el.classList.remove('validation-error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Привязка кнопок
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    document.getElementById('expandAllBtn').addEventListener('click', expandAll);
    document.getElementById('collapseAllBtn').addEventListener('click', collapseAll);
    document.getElementById('toggleChartsBtn').addEventListener('click', toggleCharts);

    document.getElementById('addNewDeviceBtn').addEventListener('click', addNewDevice);
    document.getElementById('addNewLineBtn').addEventListener('click', addNewLine);
    document.getElementById('addNewEquipmentBtn').addEventListener('click', addNewEquipment);
    document.getElementById('addEmptyEquipmentBtn').addEventListener('click', addEmptyEquipment);

    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('importJsonBtn').addEventListener('click', importJSON);
    document.getElementById('showAuditLogBtn').addEventListener('click', showAuditLog);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    document.getElementById('selectAll').addEventListener('change', (e) => toggleSelectAll(e.target.checked));
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('addType').addEventListener('change', toggleAddForm);

    document.getElementById('newAddress').addEventListener('blur', function () { validateAddressField(this); });
    document.getElementById('newZone').addEventListener('blur', function () { validateZoneField(this); });

    document.getElementById('allEquipmentLink').addEventListener('click', clearBreadcrumbs);
    document.getElementById('bulkActions').style.display = 'none';

    // Bulk actions
    document.getElementById('changeStatusBulkBtn').addEventListener('click', changeStatusBulk);
    document.getElementById('changeDateBulkBtn').addEventListener('click', changeDateBulk);
    document.getElementById('deleteBulkBtn').addEventListener('click', deleteBulk);
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);

    // Загрузка данных
    loadFromLocalStorage();
    initializeSampleData();
    renderTable();
    updateParentSelects();

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
        document.querySelector('.theme-toggle i').className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    document.getElementById('newLastCheck').value = getCurrentDate();
});