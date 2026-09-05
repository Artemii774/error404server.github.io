// ======================================================
// API
// ======================================================

const API = "https://proof-screens-atm-weights.trycloudflare.com";

const status = document.getElementById("status");
const loginSection = document.getElementById("loginSection");
const cloudSection = document.getElementById("cloudSection");
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("emailInput");
const usernameInput = document.getElementById("usernameInput");
const logoutButton = document.getElementById("logoutButton");
const userInfo = document.getElementById("userInfo");
const fileList = document.getElementById("fileList");
const uploadButton = document.getElementById("uploadButton");
const refreshButton = document.getElementById("refreshButton");
const folderButton = document.getElementById("folderButton");
const fileInput = document.getElementById("fileInput");
const currentPath = document.getElementById("currentPath");
const userStorage = document.getElementById("userStorage");

let currentUser = null;
let currentFolder = "";

// ======================================================
// SERVER CHECK
// ======================================================

async function checkServer() {
    try {
        const response = await fetch(`${API}/`);
        if (!response.ok) throw new Error("Server error");
        status.textContent = "● Сервер онлайн";
        status.style.color = "#22c55e";
    } catch (error) {
        status.textContent = "● Сервер недоступен";
        status.style.color = "#ef4444";
    }
}

// ======================================================
// LOGIN FORM HANDLER
// ======================================================

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const username = usernameInput.value.trim();

    if (!email) return;

    try {
        const response = await fetch(`${API}/auth/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username })
        });

        if (!response.ok) {
            throw new Error("Не удалось войти");
        }

        const data = await response.json();
        currentUser = data;
        showCloud();
        await loadFiles();
    } catch (error) {
        alert("Ошибка входа. Проверьте правильность введенного Gmail.");
    }
});

// ======================================================
// CHECK LOGIN
// ======================================================

async function checkLogin() {
    try {
        const response = await fetch(`${API}/auth/me`, {
            credentials: "include"
        });

        if (!response.ok) {
            showLogin();
            return;
        }

        const user = await response.json();
        currentUser = user;
        showCloud();
        await loadFiles();
    } catch (error) {
        showLogin();
    }
}

// ======================================================
// SHOW LOGIN / CLOUD
// ======================================================

function showLogin() {
    loginSection.classList.remove("hidden");
    cloudSection.classList.add("hidden");
    userInfo.textContent = "Не выполнен вход";
}

function showCloud() {
    loginSection.classList.add("hidden");
    cloudSection.classList.remove("hidden");
    if (currentUser) {
        userInfo.textContent = `${currentUser.username} (${currentUser.email})`;
    }
}

// ======================================================
// LOGOUT
// ======================================================

logoutButton.addEventListener("click", async () => {
    try {
        await fetch(`${API}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });
    } finally {
        currentUser = null;
        showLogin();
    }
});

// ======================================================
// LOAD FILES & RENDER
// ======================================================

async function loadFiles() {
    fileList.innerHTML = `<div class="loading">Загрузка файлов...</div>`;
    try {
        const url = `${API}/files?folder=${encodeURIComponent(currentFolder)}`;
        const response = await fetch(url, { credentials: "include" });

        if (!response.ok) {
            if (response.status === 401) showLogin();
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const files = Array.isArray(data) ? data : [];
        renderFiles(files);
        updateUserStorage(files);

        currentPath.textContent = currentFolder ? `Мои файлы / ${currentFolder}` : "Мои файлы";
    } catch (error) {
        fileList.innerHTML = `
            <div class="error">
                ❌ Не удалось получить список файлов
                <br><small>${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

function renderFiles(files) {
    fileList.innerHTML = "";
    if (files.length === 0) {
        fileList.innerHTML = `<div class="empty">📂 Папка пуста</div>`;
        return;
    }

    files.forEach(file => {
        const element = document.createElement("div");
        element.className = "file";
        const icon = getFileIcon(file.name, file.type);
        const size = formatBytes(file.size);

        element.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${icon}</div>
                <div>
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-size">${file.type === "directory" ? "Папка" : size}</div>
                </div>
            </div>
            <div class="file-actions">
                ${file.type === "file" ? `
                    <button class="download" onclick="downloadFile('${escapeAttribute(file.path)}')">⬇️</button>
                    <button class="more" onclick="fileInfo('${escapeAttribute(file.path)}')">ℹ️</button>
                ` : `
                    <button onclick="openFolder('${escapeAttribute(file.path)}')">📂 Открыть</button>
                `}
                <button class="delete" onclick="deleteFile('${escapeAttribute(file.path)}')">🗑️</button>
            </div>
        `;
        fileList.appendChild(element);
    });
}

function openFolder(path) {
    currentFolder = decodeURIComponent(path);
    loadFiles();
}

folderButton.addEventListener("click", async () => {
    const name = prompt("Введите название новой папки:");
    if (!name) return;

    try {
        const response = await fetch(`${API}/folders`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, folder: currentFolder })
        });
        if (!response.ok) throw new Error(await response.text());
        await loadFiles();
    } catch (error) {
        alert(`Не удалось создать папку.\n\n${error.message}`);
    }
});

function downloadFile(path) {
    window.open(`${API}/download?path=${encodeURIComponent(path)}`, "_blank");
}

async function deleteFile(path) {
    const filename = decodeURIComponent(path);
    if (!confirm(`Удалить "${filename}"?`)) return;

    try {
        const response = await fetch(`${API}/files?path=${encodeURIComponent(path)}`, {
            method: "DELETE",
            credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await loadFiles();
    } catch (error) {
        alert(`Не удалось удалить файл.\n\n${error.message}`);
    }
}

async function fileInfo(path) {
    try {
        const response = await fetch(`${API}/file-info?path=${encodeURIComponent(path)}`, { credentials: "include" });
        if (!response.ok) throw new Error("Ошибка");
        const data = await response.json();
        alert(`Файл: ${data.name}\n\nРазмер: ${formatBytes(data.size)}\nТип: ${data.type}\nИзменён: ${data.modified}`);
    } catch (error) {
        alert("Не удалось получить информацию о файле.");
    }
}

uploadButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", currentFolder);

    try {
        uploadButton.disabled = true;
        uploadButton.textContent = "⏳ Загрузка...";

        const response = await fetch(`${API}/upload`, {
            method: "POST",
            credentials: "include",
            body: formData
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        fileInput.value = "";
        await loadFiles();
    } catch (error) {
        alert(`Ошибка загрузки.\n\n${error.message}`);
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "⬆️ Загрузить файл";
    }
});

refreshButton.addEventListener("click", loadFiles);

function updateUserStorage(files) {
    let total = 0;
    files.forEach(file => {
        if (file.type === "file") total += Number(file.size) || 0;
    });
    userStorage.textContent = formatBytes(total);
}

function getFileIcon(name, type) {
    if (type === "directory") return "📁";
    const extension = name.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension)) return "🖼️";
    if (["mp4", "mov", "avi", "mkv"].includes(extension)) return "🎬";
    if (["mp3", "wav", "flac", "ogg"].includes(extension)) return "🎵";
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return "📦";
    if (extension === "pdf") return "📕";
    if (["doc", "docx"].includes(extension)) return "📘";
    if (["xls", "xlsx"].includes(extension)) return "📊";
    if (["js", "java", "py", "cpp", "c", "html", "css"].includes(extension)) return "💻";
    return "📄";
}

// ADMIN PANEL LOGIC
const adminLink = document.getElementById("adminLink");
const adminModal = document.getElementById("adminModal");
const closeAdmin = document.getElementById("closeAdmin");
const adminPassword = document.getElementById("adminPassword");
const adminLoginButton = document.getElementById("adminLoginButton");
const adminLogin = document.getElementById("adminLogin");
const adminPanel = document.getElementById("adminPanel");
const adminError = document.getElementById("adminError");

adminLink.addEventListener("click", () => {
    adminModal.classList.remove("hidden");
    adminLogin.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    adminPassword.value = "";
    adminError.textContent = "";
});

closeAdmin.addEventListener("click", () => adminModal.classList.add("hidden"));
adminLoginButton.addEventListener("click", adminLoginRequest);
adminPassword.addEventListener("keydown", event => {
    if (event.key === "Enter") adminLoginRequest();
});

async function adminLoginRequest() {
    const password = adminPassword.value;
    if (!password) return;

    adminLoginButton.disabled = true;
    try {
        const response = await fetch(`${API}/admin/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password })
        });
        if (!response.ok) {
            adminError.textContent = "❌ Неверный пароль";
            return;
        }
        adminLogin.classList.add("hidden");
        adminPanel.classList.remove("hidden");
        await loadAdminStats();
    } catch (error) {
        adminError.textContent = "Ошибка подключения к серверу.";
    } finally {
        adminLoginButton.disabled = false;
    }
}

async function loadAdminStats() {
    try {
        const response = await fetch(`${API}/admin/stats`, { credentials: "include" });
        if (!response.ok) throw new Error("Access denied");
        const data = await response.json();

        document.getElementById("adminUsers").textContent = data.users;
        document.getElementById("adminUsed").textContent = formatBytes(data.used);
        document.getElementById("adminFree").textContent = formatBytes(data.free);
        document.getElementById("adminTotal").textContent = formatBytes(data.total);

        const list = document.getElementById("adminUserList");
        list.innerHTML = "";
        data.user_emails.forEach(email => {
            const element = document.createElement("div");
            element.className = "admin-user";
            element.textContent = email;
            list.appendChild(element);
        });
    } catch (error) {
        alert("Не удалось загрузить статистику.");
    }
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttribute(text) {
    return encodeURIComponent(text);
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + " " + units[i];
}

checkServer();
checkLogin();
