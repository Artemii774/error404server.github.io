const API = "http://192.168.8.137:5000";

const status = document.getElementById("status");
const fileList = document.getElementById("fileList");
const uploadButton = document.getElementById("uploadButton");
const refreshButton = document.getElementById("refreshButton");
const fileInput = document.getElementById("fileInput");


// ==============================
// Проверка Raspberry Pi
// ==============================

async function checkServer() {
    try {
        const response = await fetch(`${API}/`);

        if (!response.ok) {
            throw new Error("Server error");
        }

        status.textContent = "● Сервер онлайн";
        status.style.color = "#22c55e";

    } catch (error) {
        status.textContent = "● Сервер недоступен";
        status.style.color = "#ef4444";
    }
}


// ==============================
// Загрузка списка файлов
// ==============================

async function loadFiles() {

    fileList.innerHTML = `
        <div class="loading">
            Загрузка файлов...
        </div>
    `;

    try {

        const response = await fetch(`${API}/files`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Наш API возвращает непосредственно массив:
        //
        // [
        //   {
        //      name: "...",
        //      path: "...",
        //      size: 123,
        //      type: "file"
        //   }
        // ]

        const files = Array.isArray(data) ? data : [];

        renderFiles(files);

    } catch (error) {

        console.error("Ошибка получения файлов:", error);

        fileList.innerHTML = `
            <div class="error">
                ❌ Не удалось получить список файлов
                <br>
                <small>${error.message}</small>
            </div>
        `;
    }
}


// ==============================
// Отображение файлов
// ==============================

function renderFiles(files) {

    fileList.innerHTML = "";

    if (files.length === 0) {

        fileList.innerHTML = `
            <div class="empty">
                📂 Папка пуста
            </div>
        `;

        return;
    }


    files.forEach(file => {

        const element = document.createElement("div");

        element.className = "file";


        const icon = getFileIcon(file.name, file.type);

        const size = formatBytes(file.size);


        element.innerHTML = `
            <div class="file-info">

                <div class="file-icon">
                    ${icon}
                </div>

                <div>

                    <div class="file-name">
                        ${escapeHtml(file.name)}
                    </div>

                    <div class="file-size">
                        ${file.type === "directory" ? "Папка" : size}
                    </div>

                </div>

            </div>


            <div class="file-actions">

                ${
            file.type === "file"
                ?
                `
                    <button
                        class="download"
                        onclick="downloadFile('${escapeAttribute(file.path)}')">
                        ⬇️ Скачать
                    </button>
                    `
                :
                ""
        }


                <button
                    class="delete"
                    onclick="deleteFile('${escapeAttribute(file.path)}')">
                    🗑️ Удалить
                </button>

            </div>
        `;


        fileList.appendChild(element);

    });
}


// ==============================
// Иконки файлов
// ==============================

function getFileIcon(name, type) {

    if (type === "directory") {
        return "📁";
    }

    const extension = name
        .split(".")
        .pop()
        .toLowerCase();


    if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension)) {
        return "🖼️";
    }

    if (["mp4", "mov", "avi", "mkv"].includes(extension)) {
        return "🎬";
    }

    if (["mp3", "wav", "flac", "ogg"].includes(extension)) {
        return "🎵";
    }

    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
        return "📦";
    }

    if (["pdf"].includes(extension)) {
        return "📕";
    }

    if (["doc", "docx"].includes(extension)) {
        return "📘";
    }

    if (["xls", "xlsx"].includes(extension)) {
        return "📊";
    }

    if (["js", "java", "py", "cpp", "c", "html", "css"].includes(extension)) {
        return "💻";
    }

    return "📄";
}


// ==============================
// Скачать файл
// ==============================

function downloadFile(path) {

    const url =
        `${API}/download?path=${encodeURIComponent(path)}`;

    window.open(url, "_blank");
}


// ==============================
// Удалить файл
// ==============================

async function deleteFile(path) {

    const filename = decodeURIComponent(path);

    const confirmed = confirm(
        `Удалить файл "${filename}"?`
    );

    if (!confirmed) {
        return;
    }


    try {

        const response = await fetch(
            `${API}/files?path=${encodeURIComponent(path)}`,
            {
                method: "DELETE"
            }
        );


        if (!response.ok) {

            const text = await response.text();

            throw new Error(
                `HTTP ${response.status}: ${text}`
            );
        }


        await loadFiles();

    } catch (error) {

        console.error("Ошибка удаления:", error);

        alert(
            `Не удалось удалить файл.\n\n${error.message}`
        );
    }
}


// ==============================
// Загрузка файла
// ==============================
//
// ВАЖНО:
// Этот блок практически такой же,
// как твой рабочий upload.
// Мы его не меняем по логике.
// ==============================

uploadButton.addEventListener("click", () => {

    fileInput.click();

});


fileInput.addEventListener("change", async () => {

    const file = fileInput.files[0];

    if (!file) {
        return;
    }


    const formData = new FormData();

    formData.append("file", file);
    formData.append("folder", "");


    try {

        uploadButton.disabled = true;

        uploadButton.textContent = "⏳ Загрузка...";


        const response = await fetch(
            `${API}/upload`,
            {
                method: "POST",
                body: formData
            }
        );


        if (!response.ok) {

            const text = await response.text();

            throw new Error(
                `HTTP ${response.status}: ${text}`
            );
        }


        fileInput.value = "";

        await loadFiles();


    } catch (error) {

        console.error("Ошибка загрузки:", error);

        alert(
            `Ошибка загрузки файла.\n\n${error.message}`
        );

    } finally {

        uploadButton.disabled = false;

        uploadButton.textContent = "⬆️ Загрузить файл";

    }

});


// ==============================
// Обновление
// ==============================

refreshButton.addEventListener(
    "click",
    loadFiles
);


// ==============================
// Защита HTML
// ==============================

function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


function escapeAttribute(text) {

    return encodeURIComponent(text);
}


// ==============================
// Размер файла
// ==============================

function formatBytes(bytes) {

    if (!bytes || bytes === 0) {
        return "0 B";
    }


    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];


    const i = Math.floor(
        Math.log(bytes) / Math.log(1024)
    );


    return (
        (bytes / Math.pow(1024, i))
            .toFixed(i === 0 ? 0 : 2)
        + " "
        + units[i]
    );
}


// ==============================
// Запуск
// ==============================

checkServer();
loadFiles();