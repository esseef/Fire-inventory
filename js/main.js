let equipmentData = { devices: [] };
let auditLog = []; // Теперь лог аудита также будет загружаться из Firebase
let appSettings = {
    currentSort: { column: null, direction: 'asc' },
    selectedItems: new Set(),
    searchHighlight: false,
    breadcrumbs: []
};
let statusChartInstance = null;
let deviceChartInstance = null;
const statusOptions = ['Запыленность', 'Критическая запыленность', 'Отключен', 'Потеря связи', 'Нет данных', 'Исправен'];
// --- НОВОЕ: Флаг для избежания лишних сохранений при первом чтении ---
let initialLoadComplete = false;
// ------------------------------------------------------------

// --- НОВОЕ: Функция заполнения полей по умолчанию ---
function fillDefaults(obj, defaults) {
    for (const key in defaults) {
        if (obj[key] === undefined) {
            obj[key] = JSON.parse(JSON.stringify(defaults[key])); // Используем JSON.parse/stringify для глубокого копирования
        } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            fillDefaults(obj[key], defaults[key]);
        } else if (Array.isArray(obj[key])) {
            obj[key].forEach(item => fillDefaults(item, defaults[key][0])); // defaults[key] должен быть массивом с одним элементом
        }
    }
}

const defaultDevice = {
    name: 'Новое устройство',
    address: '',
    zone: '',
    status: 'Нет данных',
    lastCheck: '',
    description: '',
    lines: []
};

const defaultLine = {
    name: 'Новая линия',
    address: '',
    zone: '',
    status: 'Нет данных',
    lastCheck: '',
    description: '',
    equipment: []
};

const defaultEquipment = {
    name: 'Новое оборудование',
    address: '',
    zone: '',
    status: 'Нет данных',
    lastCheck: '',
    description: ''
};
// ------------------------------------------

function generateId(prefix) {
    let id;
    do {
        id = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    } while (findEquipmentItemById(id) !== null);
    return id;
}

function findEquipmentItemById(id) {
    for (const d of equipmentData.devices) {
        for (const l of d.lines) {
            const eq = l.equipment.find(x => x.id === id);
            if (eq) return eq;
        }
    }
    return null;
}

function validateAddress(addr) {
    return /^\d+\.\d+$/.test(addr);
}

function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

// --- НОВОЕ: Функция сохранения в Firebase ---
function saveToFirebase() {
    if (!initialLoadComplete) {
        // Не сохраняем при первоначальной загрузке данных
        console.log("Пропуск сохранения в Firebase при первоначальной загрузке.");
        return;
    }
    console.log("Сохранение данных в Firebase...");
    const updates = {};
    updates['/equipmentData'] = equipmentData;
    updates['/auditLog'] = auditLog; // Сохраняем лог аудита тоже
    database.ref().update(updates)
        .then(() => {
            console.log("Данные успешно сохранены в Firebase.");
            // showToast("Данные синхронизированы с облаком.", "info"); // Опционально
        })
        .catch((error) => {
            console.error("Ошибка при сохранении в Firebase:", error);
            showToast("Ошибка синхронизации. Проверьте соединение.", "error");
        });
}
// ------------------------------------------

// --- НОВОЕ: Функция загрузки из Firebase ---
function loadFromFirebase() {
    console.log("Попытка загрузки данных из Firebase...");
    // Слушаем изменения в ветке equipmentData
    equipmentDataRef.once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            if (data && data.devices && Array.isArray(data.devices)) {
                // Применяем функцию ко всему загруженному объекту
                data.devices.forEach(device => {
                    fillDefaults(device, defaultDevice);
                    device.lines.forEach(line => {
                        fillDefaults(line, defaultLine);
                        line.equipment.forEach(eq => {
                            fillDefaults(eq, defaultEquipment);
                        });
                    });
                });
                equipmentData = data;
                console.log("Данные equipmentData загружены из Firebase и заполнены по умолчанию:", equipmentData);
            } else {
                console.log("Данные equipmentData в Firebase отсутствуют или имеют неверный формат, инициализируем пустыми.");
                equipmentData = { devices: [] }; // Инициализация пустой структуры
                initializeSampleData(); // Инициализация примера, если нужно
                saveToFirebase(); // Сохраняем пример в Firebase
            }
        })
        .catch((error) => {
            console.error("Ошибка при загрузке equipmentData из Firebase:", error);
            showToast("Ошибка загрузки данных. Проверьте консоль.", "error");
        });

    // Слушаем изменения в ветке auditLog
    auditLogRef.once('value')
        .then((snapshot) => {
            const logData = snapshot.val();
            if (logData && Array.isArray(logData)) {
                auditLog = logData;
                console.log("Лог аудита загружен из Firebase:", auditLog);
            } else {
                console.log("Лог аудита в Firebase отсутствует, инициализируем пустым.");
                auditLog = [];
            }
        })
        .catch((error) => {
            console.error("Ошибка при загрузке auditLog из Firebase:", error);
            // showToast("Ошибка загрузки лога. Проверьте консоль.", "error"); // Не критично
        })
        .finally(() => {
            initialLoadComplete = true; // Устанавливаем флаг после завершения загрузки
            renderTable(); // Рендерим таблицу после загрузки данных
            renderAuditLog(); // Рендерим лог аудита
            updateStatistics(); // Обновляем статистику
            updateCharts(); // Обновляем диаграммы
        });
}
// ------------------------------------------

function initializeSampleData() {
    const sampleData = {
        devices: [{
            id: generateId('dev'),
            name: 'Прибор 1',
            address: '0.1',
            zone: '0.1',
            status: 'Исправен',
            lastCheck: '',
            description: 'Основной прибор',
            lines: [{
                id: generateId('ln'),
                name: 'Линия 1.1',
                address: '1.1',
                zone: '1.1',
                status: 'Исправен',
                lastCheck: '',
                description: '',
                equipment: [{
                    id: generateId('eq'),
                    name: 'Извещатель ИП 212-33',
                    address: '1.20',
                    zone: '3.3',
                    status: 'Критическая запыленность',
                    lastCheck: '2023-09-10',
                    description: 'В серверной'
                }, {
                    id: generateId('eq'),
                    name: 'Извещатель ИП 212-64',
                    address: '1.21',
                    zone: '3.3',
                    status: 'Запыленность',
                    lastCheck: '2023-10-15',
                    description: ''
                }, {
                    id: generateId('eq'),
                    name: 'Извещатель ИП 212-45',
                    address: '1.22',
                    zone: '3.3',
                    status: 'Исправен',
                    lastCheck: '2023-11-20',
                    description: 'В серверной'
                }]
            }]
        }]
    };
    // Применяем fillDefaults к образцу
    sampleData.devices.forEach(device => {
        fillDefaults(device, defaultDevice);
        device.lines.forEach(line => {
            fillDefaults(line, defaultLine);
            line.equipment.forEach(eq => {
                fillDefaults(eq, defaultEquipment);
            });
        });
    });
    equipmentData = sampleData;
    addAuditEntry('Инициализация', 'Загружены примеры данных');
}

function updateStatusStyle(selectElement) {
    selectElement.classList.remove('status-исправен', 'status-запыленность', 'status-критическая-запыленность', 'status-отключен', 'status-потеря-связи', 'status-нет-данных');
    selectElement.classList.add('status-' + selectElement.value.toLowerCase().replace(' ', '-'));
}

function setLoadingState(loading) {
    const overlay = document.getElementById('loadingOverlay');
    if (loading) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type; // Добавляем класс типа
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Скопировано в буфер обмена', 'info');
    }).catch(err => {
        console.error('Ошибка копирования: ', err);
        showToast('Ошибка копирования', 'error');
    });
}

function editDescription(id, currentDesc) {
    const newDesc = prompt('Введите описание:', currentDesc || '');
    if (newDesc !== null) { // Проверяем, не нажал ли пользователь "Отмена"
        for (const d of equipmentData.devices) {
            for (const l of d.lines) {
                const eq = l.equipment.find(x => x.id === id);
                if (eq) {
                    const old = eq.description;
                    eq.description = newDesc;
                    saveToFirebase(); // Было saveToLocalStorage();
                    addAuditEntry('Изменение', `Описание изменено с "${old}" на "${newDesc}"`);
                    showToast('Описание сохранено', 'success');
                    renderTable();
                    return;
                }
            }
        }
    }
}

// --- НОВОЕ: Функция добавления записи в лог аудита (обновленная) ---
function addAuditEntry(action, details) {
    const timestamp = new Date().toLocaleString('ru-RU');
    auditLog.push({ action, details, timestamp });
    // Сохраняем лог сразу при добавлении, если загрузка завершена
    if (initialLoadComplete) {
        saveToFirebase();
    }
}
// ------------------------------------------

// --- НОВОЕ: Функция для рендеринга лога аудита ---
function renderAuditLog() {
    // Эта функция может обновлять отображение лога аудита на странице
    // или просто быть пустой, если отображение лога происходит по-другому (например, в модальном окне)
    // Пока оставим пустой, так как в UI вызов этой функции, кроме как в loadFromFirebase, не встречается
    // и отображение лога происходит в showAuditLog
    console.log("Функция renderAuditLog вызвана. Лог аудита:", auditLog);
    // Если у вас есть элемент на странице для отображения лога, обновите его здесь
    // Например:
    // const logContainer = document.getElementById('someLogContainerId');
    // logContainer.innerHTML = auditLog.map(entry => `<p>${entry.timestamp} - ${entry.action}: ${entry.details}</p>`).join('');
}
// ------------------------------------------

function showAddModal(type) {
    const modal = document.createElement('div');
    modal.id = 'addModal';
    let title, fields;
    if (type === 'device') {
        title = 'Добавить прибор';
        fields = `
            <input type="text" id="newName" placeholder="Название прибора" required>
            <input type="text" id="newAddress" placeholder="Адрес (например: 0.1)" class="tooltip" title="Формат: число.число">
            <input type="text" id="newZone" placeholder="Зона (например: 0.1)" class="tooltip" title="Формат: число.число">
            <select id="newStatus" onchange="updateStatusStyle(this)">
                <option value="Исправен">Исправен</option>
                <option value="Запыленность">Запыленность</option>
                <option value="Критическая запыленность">Критическая запыленность</option>
                <option value="Отключен">Отключен</option>
                <option value="Потеря связи">Потеря связи</option>
                <option value="Нет данных">Нет данных</option>
            </select>
            <input type="date" id="newLastCheck">
            <textarea id="newDescription" placeholder="Описание"></textarea>
        `;
    } else if (type === 'line') {
        title = 'Добавить линию АЛС';
        fields = `
            <select id="parentSelect" required></select>
            <input type="text" id="newName" placeholder="Название линии" required>
            <input type="text" id="newAddress" placeholder="Адрес (например: 1.1)" class="tooltip" title="Формат: число.число">
            <input type="text" id="newZone" placeholder="Зона (например: 1.1)" class="tooltip" title="Формат: число.число">
            <select id="newStatus" onchange="updateStatusStyle(this)">
                <option value="Исправен">Исправен</option>
                <option value="Запыленность">Запыленность</option>
                <option value="Критическая запыленность">Критическая запыленность</option>
                <option value="Отключен">Отключен</option>
                <option value="Потеря связи">Потеря связи</option>
                <option value="Нет данных">Нет данных</option>
            </select>
            <input type="date" id="newLastCheck">
            <textarea id="newDescription" placeholder="Описание"></textarea>
        `;
    } else if (type === 'equipment') {
        title = 'Добавить оборудование';
        fields = `
            <select id="parentSelect" required></select>
            <input type="text" id="newName" placeholder="Название оборудования" required>
            <input type="text" id="newAddress" placeholder="Адрес (например: 1.21)" class="tooltip" title="Формат: число.число">
            <input type="text" id="newZone" placeholder="Зона (например: 3.3)" class="tooltip" title="Формат: число.число">
            <input type="date" id="newLastCheck">
            <select id="newStatus" onchange="updateStatusStyle(this)">
                <option value="">Выберите состояние</option>
                <option value="Запыленность">Запыленность</option>
                <option value="Критическая запыленность">Критическая запыленность</option>
                <option value="Отключен">Отключен</option>
                <option value="Потеря связи">Потеря связи</option>
                <option value="Нет данных">Нет данных</option>
                <option value="Исправен">Исправен</option>
            </select>
            <textarea id="newDescription" placeholder="Описание"></textarea>
        `;
    }
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;">
            <div style="background:var(--card-bg);padding:20px;border-radius:10px;width:400px;">
                <h3><i class="fas fa-plus-circle"></i> ${title}</h3>
                ${fields}
                <div style="margin-top:15px;">
                    <button class="btn primary-btn" onclick="addNew${type.charAt(0).toUpperCase() + type.slice(1)}()">Сохранить</button>
                    <button class="btn secondary-btn" onclick="document.getElementById('addModal').remove()">Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    if (type === 'line' || type === 'equipment') {
        const parentSelect = document.getElementById('parentSelect');
        parentSelect.innerHTML = '';
        if (type === 'line') {
            equipmentData.devices.forEach(d => {
                const option = document.createElement('option');
                option.value = d.id;
                option.textContent = d.name;
                parentSelect.appendChild(option);
            });
        } else if (type === 'equipment') {
            equipmentData.devices.forEach(d => {
                d.lines.forEach(l => {
                    const option = document.createElement('option');
                    option.value = l.id;
                    option.textContent = `${d.name} > ${l.name}`;
                    parentSelect.appendChild(option);
                });
            });
        }
    }
    // Применяем стили к статусу при открытии модального окна
    const statusSelect = modal.querySelector('#newStatus');
    if (statusSelect) {
        updateStatusStyle(statusSelect);
    }
}

function addNewDevice() {
    const name = document.getElementById('newName').value;
    const address = document.getElementById('newAddress').value;
    const zone = document.getElementById('newZone').value;
    const status = document.getElementById('newStatus').value;
    const lastCheck = document.getElementById('newLastCheck').value;
    const description = document.getElementById('newDescription').value;
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    if (address && !validateAddress(address)) {
        showToast('Неверный формат адреса', 'error');
        return;
    }
    if (zone && !validateAddress(zone)) { // Предполагаем, что зона тоже в формате число.число
        showToast('Неверный формат зоны', 'error');
        return;
    }
    const newDevice = {
        id: generateId('dev'),
        name,
        address: address || '',
        zone: zone || '',
        status: status || 'Исправен',
        lastCheck: lastCheck || '',
        description: description || '',
        lines: []
    };
    equipmentData.devices.push(newDevice);
    renderTable();
    updateParentSelects();
    saveToFirebase(); // Было saveToLocalStorage();
    addAuditEntry('Добавление', `Добавлен прибор "${name}"`);
    document.getElementById('addModal').remove();
    showToast('Прибор добавлен', 'success');
}

function addNewLine() {
    const parentId = document.getElementById('parentSelect').value;
    const name = document.getElementById('newName').value;
    const address = document.getElementById('newAddress').value;
    const zone = document.getElementById('newZone').value;
    const status = document.getElementById('newStatus').value;
    const lastCheck = document.getElementById('newLastCheck').value;
    const description = document.getElementById('newDescription').value;
    if (!parentId || !name) {
        showToast('Выберите прибор и введите название линии', 'error');
        return;
    }
    if (address && !validateAddress(address)) {
        showToast('Неверный формат адреса', 'error');
        return;
    }
    if (zone && !validateAddress(zone)) {
        showToast('Неверный формат зоны', 'error');
        return;
    }
    const parentDevice = equipmentData.devices.find(d => d.id === parentId);
    if (!parentDevice) {
        showToast('Родительский прибор не найден', 'error');
        return;
    }
    const newLine = {
        id: generateId('ln'),
        name,
        address: address || '',
        zone: zone || '',
        status: status || 'Исправен',
        lastCheck: lastCheck || '',
        description: description || '',
        equipment: []
    };
    parentDevice.lines.push(newLine);
    renderTable();
    updateParentSelects();
    saveToFirebase(); // Было saveToLocalStorage();
    addAuditEntry('Добавление', `Добавлена линия "${name}" к прибору "${parentDevice.name}"`);
    document.getElementById('addModal').remove();
    showToast('Линия добавлена', 'success');
}

function addNewEquipment() {
    const parentId = document.getElementById('parentSelect').value;
    const name = document.getElementById('newName').value;
    const address = document.getElementById('newAddress').value;
    const zone = document.getElementById('newZone').value;
    const status = document.getElementById('newStatus').value;
    const lastCheck = document.getElementById('newLastCheck').value;
    const description = document.getElementById('newDescription').value;
    if (!parentId || !name) {
        showToast('Выберите линию и введите название оборудования', 'error');
        return;
    }
    if (address && !validateAddress(address)) {
        showToast('Неверный формат адреса', 'error');
        return;
    }
    if (zone && !validateAddress(zone)) {
        showToast('Неверный формат зоны', 'error');
        return;
    }
    if (!status) {
        showToast('Выберите состояние', 'error');
        return;
    }
    let targetLine = null;
    for (const d of equipmentData.devices) {
        targetLine = d.lines.find(l => l.id === parentId);
        if (targetLine) break;
    }
    if (!targetLine) {
        showToast('Родительская линия не найдена', 'error');
        return;
    }
    const newEquipment = {
        id: generateId('eq'),
        name,
        address: address || '',
        zone: zone || '',
        status,
        lastCheck: lastCheck || '',
        description: description || ''
    };
    targetLine.equipment.push(newEquipment);
    renderTable();
    updateParentSelects();
    saveToFirebase(); // Было saveToLocalStorage();
    addAuditEntry('Добавление', `Добавлено оборудование "${name}" к линии "${targetLine.name}"`);
    document.getElementById('addModal').remove();
    showToast('Оборудование добавлено', 'success');
}

function updateName(id, newName, type) {
    if (!newName) {
        showToast('Введите новое имя', 'error');
        renderTable();
        return;
    }
    let item = null;
    let parentName = '';
    let oldName = '';
    for (const d of equipmentData.devices) {
        if (d.id === id) {
            oldName = d.name;
            d.name = newName;
            item = d;
            parentName = 'Root';
            break;
        }
        for (const l of d.lines) {
            if (l.id === id) {
                oldName = l.name;
                l.name = newName;
                item = l;
                parentName = d.name;
                break;
            }
            const eq = l.equipment.find(x => x.id === id);
            if (eq) {
                oldName = eq.name;
                eq.name = newName;
                item = eq;
                parentName = `${d.name} > ${l.name}`;
                break;
            }
        }
        if (item) break;
    }
    if (item) {
        saveToFirebase(); // Было saveToLocalStorage();
        addAuditEntry('Изменение', `Имя ${type} изменено с "${oldName}" на "${newName}"`);
        showToast('Имя сохранено', 'success');
    } else {
        showToast('Элемент не найден', 'error');
    }
}

function updateAddress(id, newAddr) {
    if (newAddr && !validateAddress(newAddr)) {
        showToast('Неверный формат адреса', 'error');
        renderTable();
        return;
    }
    for (const d of equipmentData.devices) {
        if (d.id === id) {
            const old = d.address;
            d.address = newAddr;
            saveToFirebase(); // Было saveToLocalStorage();
            addAuditEntry('Изменение', `Адрес прибора изменен с "${old}" на "${newAddr}"`);
            showToast('Адрес сохранен', 'success');
            return;
        }
        for (const l of d.lines) {
            if (l.id === id) {
                const old = l.address;
                l.address = newAddr;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Адрес линии изменен с "${old}" на "${newAddr}"`);
                showToast('Адрес сохранен', 'success');
                return;
            }
            const eq = l.equipment.find(x => x.id === id);
            if (eq) {
                const old = eq.address;
                eq.address = newAddr;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Адрес оборудования изменен с "${old}" на "${newAddr}"`);
                showToast('Адрес сохранен', 'success');
                return;
            }
        }
    }
}

function updateStatus(id, newStatus) {
    if (!newStatus) return;
    for (const d of equipmentData.devices) {
        if (d.id === id) {
            const old = d.status;
            d.status = newStatus;
            saveToFirebase(); // Было saveToLocalStorage();
            addAuditEntry('Изменение', `Статус прибора изменен с "${old}" на "${newStatus}"`);
            return;
        }
        for (const l of d.lines) {
            if (l.id === id) {
                const old = l.status;
                l.status = newStatus;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Статус линии изменен с "${old}" на "${newStatus}"`);
                return;
            }
            const eq = l.equipment.find(x => x.id === id);
            if (eq) {
                const old = eq.status;
                eq.status = newStatus;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Статус оборудования изменен с "${old}" на "${newStatus}"`);
                return;
            }
        }
    }
}

function updateLastCheck(id, newDate) {
    if (newDate && !isValidDate(newDate)) {
        showToast('Неверный формат даты', 'error');
        renderTable();
        return;
    }
    for (const d of equipmentData.devices) {
        if (d.id === id) {
            const old = d.lastCheck;
            d.lastCheck = newDate;
            saveToFirebase(); // Было saveToLocalStorage();
            addAuditEntry('Изменение', `Дата проверки прибора изменена с "${old}" на "${newDate}"`);
            showToast('Дата сохранена', 'success');
            updateStatistics();
            return;
        }
        for (const l of d.lines) {
            if (l.id === id) {
                const old = l.lastCheck;
                l.lastCheck = newDate;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Дата проверки линии изменена с "${old}" на "${newDate}"`);
                showToast('Дата сохранена', 'success');
                updateStatistics();
            }
            const eq = l.equipment.find(x => x.id === id);
            if (eq) {
                const old = eq.lastCheck;
                eq.lastCheck = newDate;
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Изменение', `Дата проверки оборудования изменена с "${old}" на "${newDate}"`);
                showToast('Дата сохранена', 'success');
                updateStatistics();
                return;
            }
        }
    }
}

function deleteItem(id, type, name) {
    if (!confirm(`Удалить ${type} "${name}"? Это нельзя отменить.`)) return;
    for (let i = 0; i < equipmentData.devices.length; i++) {
        const d = equipmentData.devices[i];
        if (d.id === id) {
            equipmentData.devices.splice(i, 1);
            saveToFirebase(); // Было saveToLocalStorage();
            addAuditEntry('Удаление', `Удален прибор "${name}"`);
            showToast(`Прибор "${name}" удален`, 'success');
            renderTable();
            updateParentSelects();
            return;
        }
        for (let j = 0; j < d.lines.length; j++) {
            const l = d.lines[j];
            if (l.id === id) {
                d.lines.splice(j, 1);
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Удаление', `Удалена линия "${name}" из прибора "${d.name}"`);
                showToast(`Линия "${name}" удалена`, 'success');
                renderTable();
                updateParentSelects();
                return;
            }
            const eqIndex = l.equipment.findIndex(x => x.id === id);
            if (eqIndex > -1) {
                const removedEq = l.equipment[eqIndex];
                l.equipment.splice(eqIndex, 1);
                saveToFirebase(); // Было saveToLocalStorage();
                addAuditEntry('Удаление', `Удалено оборудование "${removedEq.name}" из линии "${l.name}"`);
                showToast(`Оборудование "${removedEq.name}" удалено`, 'success');
                renderTable();
                updateParentSelects();
                return;
            }
        }
    }
}

function clearAll() {
    if (confirm('Вы уверены, что хотите очистить все данные? Это нельзя отменить.')) {
        equipmentData.devices = [];
        renderTable();
        updateParentSelects();
        saveToFirebase(); // Было saveToLocalStorage();
        addAuditEntry('Система', 'Все данные очищены');
        showToast('Все данные очищены', 'warning');
    }
}

function exportToExcel() {
    setLoadingState(true);
    try {
        const wsData = [["Прибор", "Линия АЛС", "Оборудование", "Адрес", "Зона", "Состояние", "Дата проверки", "Описание"]];
        equipmentData.devices.forEach(device => {
            device.lines.forEach(line => {
                line.equipment.forEach(eq => {
                    wsData.push([device.name, line.name, eq.name, eq.address, eq.zone, eq.status, eq.lastCheck, eq.description]);
                });
            });
        });
        // Используем SheetJS (xlsx) для создания файла
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Оборудование");
        XLSX.writeFile(wb, 'пожарное_оборудование.xlsx');
        addAuditEntry('Экспорт', 'Данные экспортированы в Excel');
        showToast('Данные экспортированы в Excel', 'success');
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
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'пожарное_оборудование.json';
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

document.getElementById('fileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoadingState(true);
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.devices && Array.isArray(data.devices)) {
                // Применяем fillDefaults к загруженному объекту
                data.devices.forEach(device => {
                    fillDefaults(device, defaultDevice);
                    device.lines.forEach(line => {
                        fillDefaults(line, defaultLine);
                        line.equipment.forEach(eq => {
                            fillDefaults(eq, defaultEquipment);
                        });
                    });
                });
                equipmentData = data;
                renderTable();
                updateParentSelects();
                saveToFirebase(); // Было saveToLocalStorage();
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
            element: `
                <tr data-id="${device.id}" data-type="device" onclick="toggleSelection('${device.id}', 'device', this)" oncontextmenu="showContextMenu(event, '${device.id}', 'прибор', '${device.name}', '${device.address}', '${device.description}')">
                    <td><strong>${device.name}</strong></td>
                    <td></td>
                    <td></td>
                    <td>${device.address}</td>
                    <td>${device.zone}</td>
                    <td><span class="status-badge status-${device.status.toLowerCase().replace(' ', '-')}">${device.status}</span></td>
                    <td>${device.lastCheck}</td>
                    <td>${device.description}</td>
                    <td>
                        <button class="btn-icon" onclick="showEditModal('${device.id}', 'device', '${device.name}', '${device.address}', '${device.zone}', '${device.status}', '${device.lastCheck}', '${device.description}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="deleteItem('${device.id}', 'прибор', '${device.name}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `,
            level: 0,
            sortKey: device.name.toLowerCase()
        });
        for (const line of device.lines) {
            allRows.push({
                element: `
                    <tr data-id="${line.id}" data-type="line" class="child-row" onclick="toggleSelection('${line.id}', 'line', this)" oncontextmenu="showContextMenu(event, '${line.id}', 'линия', '${line.name}', '${line.address}', '${line.description}')">
                        <td></td>
                        <td><strong>${line.name}</strong></td>
                        <td></td>
                        <td>${line.address}</td>
                        <td>${line.zone}</td>
                        <td><span class="status-badge status-${line.status.toLowerCase().replace(' ', '-')}">${line.status}</span></td>
                        <td>${line.lastCheck}</td>
                        <td>${line.description}</td>
                        <td>
                            <button class="btn-icon" onclick="showEditModal('${line.id}', 'line', '${line.name}', '${line.address}', '${line.zone}', '${line.status}', '${line.lastCheck}', '${line.description}')"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon" onclick="deleteItem('${line.id}', 'линия', '${line.name}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `,
                level: 1,
                sortKey: device.name.toLowerCase() + line.name.toLowerCase()
            });
            for (const eq of line.equipment) {
                const isMatch = ((eq.name || '').toLowerCase().includes(searchTerm) ||
                    (eq.address || '').toLowerCase().includes(searchTerm) ||
                    (eq.zone || '').toLowerCase().includes(searchTerm) ||
                    (eq.description || '').toLowerCase().includes(searchTerm));
                const isStatusMatch = !statusFilter || (eq.status || '') === statusFilter;
                if (isMatch && isStatusMatch) {
                    allRows.push({
                        element: `
                            <tr data-id="${eq.id}" data-type="equipment" class="child-row" onclick="toggleSelection('${eq.id}', 'equipment', this)" oncontextmenu="showContextMenu(event, '${eq.id}', 'оборудование', '${eq.name}', '${eq.address}', '${eq.description}')">
                                <td></td>
                                <td></td>
                                <td>${eq.name}</td>
                                <td>${eq.address}</td>
                                <td>${eq.zone}</td>
                                <td><span class="status-badge status-${(eq.status || '').toLowerCase().replace(' ', '-')}">${eq.status || 'Нет данных'}</span></td>
                                <td>${eq.lastCheck}</td>
                                <td>${eq.description}</td>
                                <td>
                                    <button class="btn-icon" onclick="showEditModal('${eq.id}', 'equipment', '${eq.name}', '${eq.address}', '${eq.zone}', '${eq.status}', '${eq.lastCheck}', '${eq.description}')"><i class="fas fa-edit"></i></button>
                                    <button class="btn-icon" onclick="deleteItem('${eq.id}', 'оборудование', '${eq.name}')"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `,
                        level: 2,
                        sortKey: device.name.toLowerCase() + line.name.toLowerCase() + eq.name.toLowerCase()
                    });
                }
            }
        }
    }
    // Сортировка
    if (appSettings.currentSort.column !== null) {
        const col = appSettings.currentSort.column;
        allRows.sort((a, b) => {
            let valA, valB;
            switch (col) {
                case 0: valA = a.level === 0 ? a.sortKey : (a.level === 1 ? a.sortKey.split('').slice(0, -1).join('') : a.sortKey.split('').slice(0, -2).join('')); break;
                case 1: valA = a.level === 1 ? a.sortKey.split('').slice(-1)[0] : (a.level === 2 ? a.sortKey.split('').slice(-2).join('').split('').slice(0, -1).join('') : ''); break;
                case 2: valA = a.level === 2 ? a.sortKey.split('').slice(-2).join('').split('').slice(-1)[0] : ''; break;
                default: valA = ''; // Другие столбцы не сортируем в этой реализации
            }
            switch (col) {
                case 0: valB = b.level === 0 ? b.sortKey : (b.level === 1 ? b.sortKey.split('').slice(0, -1).join('') : b.sortKey.split('').slice(0, -2).join('')); break;
                case 1: valB = b.level === 1 ? b.sortKey.split('').slice(-1)[0] : (b.level === 2 ? b.sortKey.split('').slice(-2).join('').split('').slice(0, -1).join('') : ''); break;
                case 2: valB = b.level === 2 ? b.sortKey.split('').slice(-2).join('').split('').slice(-1)[0] : ''; break;
                default: valB = '';
            }
            if (valA < valB) return appSettings.currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return appSettings.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    allRows.forEach(row => {
        tbody.innerHTML += row.element;
    });
    updateSelectionCount();
}

function updateParentSelects() {
    // Обновление выпадающих списков для добавления/редактирования (при необходимости)
    // Эта функция может быть полезна, если у вас есть динамические select'ы на странице
    // Пока оставим пустой или реализуем при необходимости
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveToFirebase(); // Было saveToLocalStorage();
            showToast('Данные сохранены (Ctrl+S)', 'info');
        }
        if (e.key === 'Delete' && appSettings.selectedItems.size > 0) {
            e.preventDefault();
            deleteBulk(); // Предполагаем, что deleteBulk реализована
        }
    });
}

function initializeApp() {
    setupEventListeners();
    setupKeyboardShortcuts();
    // loadFromLocalStorage(); // Было loadFromLocalStorage();
    loadFromFirebase(); // Загружаем данные из Firebase при загрузке
    updateParentSelects();
}

function showEditModal(id, type, currentName, currentAddress, currentZone, currentStatus, currentLastCheck, currentDescription) {
    const modal = document.createElement('div');
    modal.id = 'editModal';
    let title, fields;
    if (type === 'device') {
        title = 'Редактировать прибор';
        fields = `
            <input type="text" id="editName" value="${currentName}" placeholder="Название прибора" required>
            <input type="text" id="editAddress" value="${currentAddress}" placeholder="Адрес (например: 0.1)" class="tooltip" title="Формат: число.число">
            <input type="text" id="editZone" value="${currentZone}" placeholder="Зона (например: 0.1)" class="tooltip" title="Формат: число.число">
            <select id="editStatus" onchange="updateStatusStyle(this)">
                <option value="Исправен" ${currentStatus === 'Исправен' ? 'selected' : ''}>Исправен</option>
                <option value="Запыленность" ${currentStatus === 'Запыленность' ? 'selected' : ''}>Запыленность</option>
                <option value="Критическая запыленность" ${currentStatus === 'Критическая запыленность' ? 'selected' : ''}>Критическая запыленность</option>
                <option value="Отключен" ${currentStatus === 'Отключен' ? 'selected' : ''}>Отключен</option>
                <option value="Потеря связи" ${currentStatus === 'Потеря связи' ? 'selected' : ''}>Потеря связи</option>
                <option value="Нет данных" ${currentStatus === 'Нет данных' ? 'selected' : ''}>Нет данных</option>
            </select>
            <input type="date" id="editLastCheck" value="${currentLastCheck}">
            <textarea id="editDescription" placeholder="Описание">${currentDescription}</textarea>
        `;
    } else if (type === 'line') {
        title = 'Редактировать линию';
        fields = `
            <input type="text" id="editName" value="${currentName}" placeholder="Название линии" required>
            <input type="text" id="editAddress" value="${currentAddress}" placeholder="Адрес (например: 1.1)" class="tooltip" title="Формат: число.число">
            <input type="text" id="editZone" value="${currentZone}" placeholder="Зона (например: 1.1)" class="tooltip" title="Формат: число.число">
            <select id="editStatus" onchange="updateStatusStyle(this)">
                <option value="Исправен" ${currentStatus === 'Исправен' ? 'selected' : ''}>Исправен</option>
                <option value="Запыленность" ${currentStatus === 'Запыленность' ? 'selected' : ''}>Запыленность</option>
                <option value="Критическая запыленность" ${currentStatus === 'Критическая запыленность' ? 'selected' : ''}>Критическая запыленность</option>
                <option value="Отключен" ${currentStatus === 'Отключен' ? 'selected' : ''}>Отключен</option>
                <option value="Потеря связи" ${currentStatus === 'Потеря связи' ? 'selected' : ''}>Потеря связи</option>
                <option value="Нет данных" ${currentStatus === 'Нет данных' ? 'selected' : ''}>Нет данных</option>
            </select>
            <input type="date" id="editLastCheck" value="${currentLastCheck}">
            <textarea id="editDescription" placeholder="Описание">${currentDescription}</textarea>
        `;
    } else if (type === 'equipment') {
        title = 'Редактировать оборудование';
        fields = `
            <input type="text" id="editName" value="${currentName}" placeholder="Название оборудования" required>
            <input type="text" id="editAddress" value="${currentAddress}" placeholder="Адрес (например: 1.21)" class="tooltip" title="Формат: число.число">
            <input type="text" id="editZone" value="${currentZone}" placeholder="Зона (например: 3.3)" class="tooltip" title="Формат: число.число">
            <input type="date" id="editLastCheck" value="${currentLastCheck}">
            <select id="editStatus" onchange="updateStatusStyle(this)">
                <option value="Запыленность" ${currentStatus === 'Запыленность' ? 'selected' : ''}>Запыленность</option>
                <option value="Критическая запыленность" ${currentStatus === 'Критическая запыленность' ? 'selected' : ''}>Критическая запыленность</option>
                <option value="Отключен" ${currentStatus === 'Отключен' ? 'selected' : ''}>Отключен</option>
                <option value="Потеря связи" ${currentStatus === 'Потеря связи' ? 'selected' : ''}>Потеря связи</option>
                <option value="Нет данных" ${currentStatus === 'Нет данных' ? 'selected' : ''}>Нет данных</option>
                <option value="Исправен" ${currentStatus === 'Исправен' ? 'selected' : ''}>Исправен</option>
            </select>
            <textarea id="editDescription" placeholder="Описание">${currentDescription}</textarea>
        `;
    }
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;">
            <div style="background:var(--card-bg);padding:20px;border-radius:10px;width:400px;">
                <h3><i class="fas fa-edit"></i> ${title}</h3>
                ${fields}
                <div style="margin-top:15px;">
                    <button class="btn primary-btn" onclick="saveEdit('${id}', '${type}')">Сохранить</button>
                    <button class="btn secondary-btn" onclick="document.getElementById('editModal').remove()">Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // Применяем стили к статусу при открытии модального окна
    const statusSelect = modal.querySelector('#editStatus');
    if (statusSelect) {
        updateStatusStyle(statusSelect);
    }
}

function saveEdit(id, type) {
    const name = document.getElementById('editName').value;
    const address = document.getElementById('editAddress').value;
    const zone = document.getElementById('editZone').value;
    const status = document.getElementById('editStatus').value;
    const lastCheck = document.getElementById('editLastCheck').value;
    const description = document.getElementById('editDescription').value;
    if (!name) {
        showToast('Введите название', 'error');
        return;
    }
    if (address && !validateAddress(address)) {
        showToast('Неверный формат адреса', 'error');
        return;
    }
    if (zone && !validateAddress(zone)) {
        showToast('Неверный формат зоны', 'error');
        return;
    }
    if (type === 'equipment' && !status) {
        showToast('Выберите состояние', 'error');
        return;
    }
    let item = null;
    let parentName = '';
    let oldValues = {};
    for (const d of equipmentData.devices) {
        if (d.id === id) {
            item = d;
            parentName = 'Root';
            oldValues = { name: d.name, address: d.address, zone: d.zone, status: d.status, lastCheck: d.lastCheck, description: d.description };
            d.name = name;
            d.address = address;
            d.zone = zone;
            d.status = status;
            d.lastCheck = lastCheck;
            d.description = description;
            break;
        }
        for (const l of d.lines) {
            if (l.id === id) {
                item = l;
                parentName = d.name;
                oldValues = { name: l.name, address: l.address, zone: l.zone, status: l.status, lastCheck: l.lastCheck, description: l.description };
                l.name = name;
                l.address = address;
                l.zone = zone;
                l.status = status;
                l.lastCheck = lastCheck;
                l.description = description;
                break;
            }
            const eq = l.equipment.find(x => x.id === id);
            if (eq) {
                item = eq;
                parentName = `${d.name} > ${l.name}`;
                oldValues = { name: eq.name, address: eq.address, zone: eq.zone, status: eq.status, lastCheck: eq.lastCheck, description: eq.description };
                eq.name = name;
                eq.address = address;
                eq.zone = zone;
                eq.status = status;
                eq.lastCheck = lastCheck;
                eq.description = description;
                break;
            }
        }
        if (item) break;
    }
    if (item) {
        saveToFirebase(); // Было saveToLocalStorage();
        // Формируем сообщение об изменении
        let changes = [];
        if (oldValues.name !== name) changes.push(`имя с "${oldValues.name}" на "${name}"`);
        if (oldValues.address !== address) changes.push(`адрес с "${oldValues.address}" на "${address}"`);
        if (oldValues.zone !== zone) changes.push(`зону с "${oldValues.zone}" на "${zone}"`);
        if (oldValues.status !== status) changes.push(`статус с "${oldValues.status}" на "${status}"`);
        if (oldValues.lastCheck !== lastCheck) changes.push(`дату проверки с "${oldValues.lastCheck}" на "${lastCheck}"`);
        if (oldValues.description !== description) changes.push(`описание с "${oldValues.description}" на "${description}"`);
        if (changes.length > 0) {
            addAuditEntry('Изменение', `${type.charAt(0).toUpperCase() + type.slice(1)} "${name}": ${changes.join(', ')}`);
        }
        showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} сохранено`, 'success');
        document.getElementById('editModal').remove();
        renderTable();
    } else {
        showToast('Элемент не найден', 'error');
    }
}

function toggleSelection(id, type, rowElement) {
    const itemKey = `${type}-${id}`;
    if (appSettings.selectedItems.has(itemKey)) {
        appSettings.selectedItems.delete(itemKey);
        rowElement.classList.remove('selected');
    } else {
        appSettings.selectedItems.add(itemKey);
        rowElement.classList.add('selected');
    }
    updateSelectionCount();
}

function updateSelectionCount() {
    const count = appSettings.selectedItems.size;
    document.getElementById('selectionCount').textContent = `Выбрано: ${count} элементов`;
}

function clearSelection() {
    appSettings.selectedItems.clear();
    document.querySelectorAll('#tableBody tr.selected').forEach(row => row.classList.remove('selected'));
    updateSelectionCount();
}

function changeStatusBulk() {
    if (appSettings.selectedItems.size === 0) return;
    let hasEquipment = false;
    for (const item of appSettings.selectedItems) {
        if (item.startsWith('equipment-')) {
            hasEquipment = true;
            break;
        }
    }
    if (!hasEquipment) return showToast('Выберите хотя бы одно оборудование', 'warning');
    const modal = document.createElement('div');
    modal.id = 'bulkStatusModal';
    modal.innerHTML = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;"><div style="background:var(--card-bg);padding:20px;border-radius:10px;width:300px;"><h3><i class="fas fa-exchange-alt"></i> Изменить статус</h3><select id="bulkStatusInput" style="width:100%;padding:10px;margin:10px 0;" onchange="updateStatusStyle(this)"><option value="Исправен">Исправен</option><option value="Запыленность">Запыленность</option><option value="Критическая запыленность">Критическая запыленность</option><option value="Отключен">Отключен</option><option value="Потеря связи">Потеря связи</option><option value="Нет данных">Нет данных</option></select><div style="margin-top:15px;"><button class="btn primary-btn" onclick="applyBulkStatus()">Применить</button><button class="btn secondary-btn" onclick="document.getElementById('bulkStatusModal').remove()">Отмена</button></div></div></div>`;
    document.body.appendChild(modal);
    // Применяем стили к статусу при открытии модального окна
    const statusSelect = modal.querySelector('#bulkStatusInput');
    if (statusSelect) {
        updateStatusStyle(statusSelect);
    }
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
                    if (eq) {
                        eq.status = newStatus;
                        count++;
                    }
                }
            }
        }
    });
    document.getElementById('bulkStatusModal').remove();
    renderTable();
    saveToFirebase(); // Было saveToLocalStorage();
    clearSelection();
    addAuditEntry('Массовое изменение', `Статус изменен для ${count} элементов`);
    showToast(`Статус изменен для ${count} элементов`, 'success');
}

function changeDateBulk() {
    if (appSettings.selectedItems.size === 0) return;
    let hasEquipment = false;
    for (const item of appSettings.selectedItems) {
        if (item.startsWith('equipment-')) {
            hasEquipment = true;
            break;
        }
    }
    if (!hasEquipment) return showToast('Выберите хотя бы одно оборудование', 'warning');
    const modal = document.createElement('div');
    modal.id = 'bulkDateModal';
    modal.innerHTML = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;"><div style="background:var(--card-bg);padding:20px;border-radius:10px;width:300px;"><h3><i class="fas fa-calendar-alt"></i> Изменить дату проверки</h3><input type="date" id="bulkDateInput" style="width:100%;padding:10px;margin:10px 0;"><div style="margin-top:15px;"><button class="btn primary-btn" onclick="applyBulkDate()">Применить</button><button class="btn secondary-btn" onclick="document.getElementById('bulkDateModal').remove()">Отмена</button></div></div></div>`;
    document.body.appendChild(modal);
}

function applyBulkDate() {
    const newDate = document.getElementById('bulkDateInput').value;
    if (newDate && !isValidDate(newDate)) {
        showToast('Неверный формат даты', 'error');
        return;
    }
    let count = 0;
    appSettings.selectedItems.forEach(item => {
        if (item.startsWith('equipment-')) {
            const id = item.split('-')[1];
            for (const d of equipmentData.devices) {
                for (const l of d.lines) {
                    const eq = l.equipment.find(e => e.id === id);
                    if (eq) {
                        eq.lastCheck = newDate;
                        count++;
                    }
                }
            }
        }
    });
    document.getElementById('bulkDateModal').remove();
    renderTable();
    saveToFirebase(); // Было saveToLocalStorage();
    clearSelection();
    addAuditEntry('Массовое изменение', `Дата проверки изменена для ${count} элементов`);
    showToast(`Дата проверки изменена для ${count} элементов`, 'success');
    updateStatistics();
}

function deleteBulk() {
    if (appSettings.selectedItems.size === 0) return;
    if (!confirm(`Удалить ${appSettings.selectedItems.size} выбранных элементов? Это нельзя отменить.`)) return;
    let count = 0;
    // Проходим по копии Set, чтобы избежать проблем с итерацией при удалении
    for (const item of new Set(appSettings.selectedItems)) {
        const [type, id] = item.split('-', 2);
        if (type === 'device' || type === 'line' || type === 'equipment') {
            // Найдем имя элемента для лога аудита
            let name = 'Unknown';
            for (const d of equipmentData.devices) {
                if (d.id === id) { name = d.name; break; }
                for (const l of d.lines) {
                    if (l.id === id) { name = l.name; break; }
                    const eq = l.equipment.find(x => x.id === id);
                    if (eq) { name = eq.name; break; }
                }
                if (name !== 'Unknown') break;
            }
            deleteItem(id, type, name); // Вызываем обычную функцию удаления, она обновит UI и сохранит
            count++;
        }
    }
    // renderTable(); // deleteItem уже вызывает renderTable()
    // updateParentSelects(); // deleteItem уже вызывает updateParentSelects()
    // saveToFirebase(); // deleteItem уже вызывает saveToFirebase()
    // clearSelection(); // Вызывается в конце
    // addAuditEntry('Массовое удаление', `Удалено ${count} элементов`); // addAuditEntry уже вызывается в deleteItem
    // showToast(`Удалено ${count} элементов`, 'success'); // showToast уже вызывается в deleteItem
    clearSelection();
    showToast(`Удалено ${count} элементов`, 'success');
    addAuditEntry('Массовое удаление', `Удалено ${count} элементов`);
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
    // Простая сортировка только по первым трем столбцам (Прибор, Линия, Оборудование)
    // Сортировка учитывает вложенность
    rows.sort((a, b) => {
        const textA = a.cells[colIdx].textContent.trim().toLowerCase();
        const textB = b.cells[colIdx].textContent.trim().toLowerCase();
        const levelA = Array.from(a.classList).includes('child-row') ? (Array.from(a.classList).includes('child-row') ? 2 : 1) : 0;
        const levelB = Array.from(b.classList).includes('child-row') ? (Array.from(b.classList).includes('child-row') ? 2 : 1) : 0;
        // Сравниваем уровни
        if (levelA < levelB) return appSettings.currentSort.direction === 'asc' ? -1 : 1;
        if (levelA > levelB) return appSettings.currentSort.direction === 'asc' ? 1 : -1;
        // Если уровни равны, сравниваем текст
        if (textA < textB) return appSettings.currentSort.direction === 'asc' ? -1 : 1;
        if (textA > textB) return appSettings.currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    // Удаляем все строки
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }
    // Вставляем отсортированные обратно
    rows.forEach(row => tbody.appendChild(row));
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
        {
            text: '<i class="fas fa-edit"></i> Редактировать',
            action: () => showEditModal(id, type, name, address, '', '', '', currentDesc) // Упрощенно, передаем только name, addr, desc
        },
        {
            text: '<i class="fas fa-trash"></i> Удалить',
            action: () => deleteItem(id, type, name)
        }
    ];
    items.forEach(item => {
        if (item.separator) {
            const separator = document.createElement('hr');
            menu.appendChild(separator);
        } else {
            const menuItem = document.createElement('div');
            menuItem.innerHTML = item.text;
            menuItem.addEventListener('click', () => {
                item.action();
                menu.style.display = 'none';
            });
            menu.appendChild(menuItem);
        }
    });
    menu.style.display = 'block';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
}

document.addEventListener('click', () => document.getElementById('contextMenu').style.display = 'none');

// --- УДАЛЕНА: Функция saveToLocalStorage ---
// function saveToLocalStorage() {
//     localStorage.setItem('fireEquipmentData', JSON.stringify(equipmentData));
//     localStorage.setItem('fireEquipmentAuditLog', JSON.stringify(auditLog));
// }
// ------------------------------------------

// --- УДАЛЕНА: Функция loadFromLocalStorage ---
// function loadFromLocalStorage() {
//     setLoadingState(true);
//     try {
//         const data = localStorage.getItem('fireEquipmentData');
//         if (data) try { equipmentData = JSON.parse(data); } catch (e) { console.error(e); }
//         const logData = localStorage.getItem('fireEquipmentAuditLog');
//         if (logData) try { auditLog = JSON.parse(logData); } catch (e) { console.error(e); }
//     } catch (error) {
//         console.error('Error loading from localStorage:', error);
//         showToast('Ошибка загрузки данных', 'error');
//     } finally {
//         setLoadingState(false);
//         renderTable();
//         updateParentSelects();
//         updateStatistics();
//         updateCharts();
//     }
// }
// ------------------------------------------

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('appTheme', newTheme); // Сохраняем тему в localStorage для постоянства
    showToast(`Тема изменена на ${newTheme === 'dark' ? 'Тёмную' : 'Светлую'}`, 'info');
}

function applyFilters() { renderTable(); }

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    applyFilters();
    showToast('Фильтры сброшены', 'info');
}

function updateStatistics() {
    const stats = { total: 0 };
    const visibleStats = { total: 0 }; // Статистика для отображения (с учетом фильтров)
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    equipmentData.devices.forEach(d => {
        d.lines.forEach(l => {
            l.equipment.forEach(eq => {
                stats.total++;
                stats[eq.status] = (stats[eq.status] || 0) + 1;
                const isMatch = ((eq.name || '').toLowerCase().includes(searchTerm) ||
                    (eq.address || '').toLowerCase().includes(searchTerm) ||
                    (eq.zone || '').toLowerCase().includes(searchTerm) ||
                    (eq.description || '').toLowerCase().includes(searchTerm));
                const isStatusMatch = !statusFilter || (eq.status || '') === statusFilter;
                if (isMatch && isStatusMatch) {
                    visibleStats.total++;
                    visibleStats[eq.status] = (visibleStats[eq.status] || 0) + 1;
                }
            });
        });
    });
    window.visibleStats = visibleStats; // Глобальная переменная для доступа в других функциях
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
        { label: 'Всего', value: visibleStats.total, color: 'var(--primary-color)', icon: 'fa-fire-extinguisher' },
        { label: 'Исправен', value: visibleStats['Исправен'] || 0, color: statusColors['Исправен'], icon: 'fa-check-circle' },
        { label: 'Запыленность', value: visibleStats['Запыленность'] || 0, color: statusColors['Запыленность'], icon: 'fa-exclamation-triangle' },
        { label: 'Критическая запыленность', value: visibleStats['Критическая запыленность'] || 0, color: statusColors['Критическая запыленность'], icon: 'fa-exclamation-circle' },
        { label: 'Отключен', value: visibleStats['Отключен'] || 0, color: statusColors['Отключен'], icon: 'fa-power-off' },
        { label: 'Потеря связи', value: visibleStats['Потеря связи'] || 0, color: statusColors['Потеря связи'], icon: 'fa-wifi' },
        { label: 'Нет данных', value: visibleStats['Нет данных'] || 0, color: statusColors['Нет данных'], icon: 'fa-question-circle' }
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
    const container = document.getElementById('chartsContainer');
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        updateCharts(); // Обновляем диаграммы при открытии
    } else {
        container.style.display = 'none';
        // Уничтожаем диаграммы при закрытии (опционально)
        if (statusChartInstance) {
            statusChartInstance.destroy();
            statusChartInstance = null;
        }
        if (deviceChartInstance) {
            deviceChartInstance.destroy();
            deviceChartInstance = null;
        }
    }
}

function updateCharts() {
    if (document.getElementById('chartsContainer').style.display === 'none') return;
    const ctx1 = document.getElementById('statusChart').getContext('2d');
    const ctx2 = document.getElementById('deviceChart').getContext('2d');
    // Уничтожаем старые диаграммы, если они существуют
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }
    if (deviceChartInstance) {
        deviceChartInstance.destroy();
    }
    // Подготовка данных для диаграммы статусов
    const statusData = {};
    equipmentData.devices.forEach(d => {
        d.lines.forEach(l => {
            l.equipment.forEach(eq => {
                statusData[eq.status] = (statusData[eq.status] || 0) + 1;
            });
        });
    });
    const statusLabels = Object.keys(statusData);
    const statusValues = Object.values(statusData);
    const statusChartColors = statusLabels.map(status => {
        const colorMap = {
            'Исправен': 'rgba(40, 167, 69, 0.7)',
            'Запыленность': 'rgba(255, 193, 7, 0.7)',
            'Критическая запыленность': 'rgba(255, 152, 0, 0.7)',
            'Отключен': 'rgba(220, 53, 69, 0.7)',
            'Потеря связи': 'rgba(108, 117, 125, 0.7)',
            'Нет данных': 'rgba(23, 162, 184, 0.7)'
        };
        return colorMap[status] || 'rgba(128, 128, 128, 0.7)';
    });
    // Подготовка данных для диаграммы по приборам
    const deviceData = {};
    equipmentData.devices.forEach(d => {
        let count = 0;
        d.lines.forEach(l => {
            count += l.equipment.length;
        });
        deviceData[d.name] = count;
    });
    statusChartInstance = new Chart(ctx1, {
        type: 'pie',
         { // <-- Имя свойства 'data'
            labels: statusLabels,
            datasets: [{
                data: statusValues,
                backgroundColor: statusChartColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, // Важно для адаптивности
            maintainAspectRatio: false, // Отключаем сохранение соотношения сторон по умолчанию
            aspectRatio: 1.3, // Ширина / Высота, делаем диаграмму чуть шире
            plugins: {
                title: {
                    display: true,
                    text: 'Распределение по состояниям'
                }
            }
        }
    });

    // ИСПРАВЛЕНО: Убрана лишняя запятая после 'data'
    deviceChartInstance = new Chart(ctx2, {
        type: 'bar',
         { // <-- Начало объекта data
            labels: Object.keys(deviceData),
            datasets: [{
                label: 'Количество оборудования',
                 Object.values(deviceData), // <-- Имя свойства 'data' внутри datasets
                backgroundColor: 'rgba(46, 134, 171, 0.7)',
                borderColor: 'rgba(46, 134, 171, 1)',
                borderWidth: 1
            }]
        }, // <-- Запятая после 'data', разделяющая свойства объекта Chart
        options: { // <-- Начало свойства 'options'
            responsive: true, // Важно для адаптивности
            maintainAspectRatio: false, // Отключаем сохранение соотношения сторон по умолчанию
            aspectRatio: 1.3, // Ширина / Высота, делаем диаграмму чуть шире
            plugins: {
                title: {
                    display: true,
                    text: 'Оборудование по приборам'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function showAuditLog() {
    const modal = document.createElement('div');
    modal.id = 'auditLogModal';
    modal.innerHTML = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;justify-content:center;align-items:center;"><div style="background:var(--card-bg);padding:20px;border-radius:10px;width:80%;max-height:80vh;overflow-y:auto;"><h3><i class="fas fa-history"></i> Журнал аудита</h3><div id="auditLogContent" style="margin-top:10px;"></div><div style="margin-top:15px;"><button class="btn secondary-btn" onclick="document.getElementById('auditLogModal').remove()">Закрыть</button></div></div></div>`;
    document.body.appendChild(modal);
    const contentDiv = document.getElementById('auditLogContent');
    if (auditLog.length === 0) {
        contentDiv.innerHTML = '<p>Журнал аудита пуст.</p>';
    } else {
        // Отображаем последние 50 записей, самые свежие наверху
        const recentLogs = auditLog.slice(-50).reverse();
        contentDiv.innerHTML = recentLogs.map(entry => `<p><strong>${entry.timestamp}</strong> - ${entry.action}: ${entry.details}</p>`).join('');
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function () {
    // Загружаем тему из localStorage
    const savedTheme = localStorage.getItem('appTheme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
    }
    initializeApp();
});