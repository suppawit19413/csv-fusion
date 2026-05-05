/**
 * CSV Fusion - App Logic
 * Handles file reading, merging, and previewing.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListContainer = document.getElementById('file-list');
    const fileCountBadge = document.getElementById('file-count');
    const mergeBtn = document.getElementById('merge-btn');
    const clearAllBtn = document.getElementById('clear-all');
    const previewSection = document.getElementById('preview-section');
    const previewTable = document.getElementById('data-preview');
    const previewInfo = document.getElementById('preview-info');
    const downloadBtn = document.getElementById('download-btn');

    const dedupeCheck = document.getElementById('dedupe-check');
    const sortCheck = document.getElementById('sort-check');
    const idColSelector = document.getElementById('id-col-selector');
    const idColumnSelect = document.getElementById('id-column');

    let uploadedFiles = []; // Array of File objects
    let mergedData = null; // Result of the merge

    // --- File Input Handlers ---

    dedupeCheck.addEventListener('change', () => {
        if (dedupeCheck.checked) {
            idColSelector.classList.remove('hidden');
        } else {
            idColSelector.classList.add('hidden');
        }
    });

    function updateIdColumns(headers) {
        const currentVal = idColumnSelect.value;
        idColumnSelect.innerHTML = '';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            // Auto-select common ID names
            const lowerH = h.toLowerCase();
            if (['id', 'row_id', 'passengerid', 'guid'].includes(lowerH)) {
                opt.selected = true;
            }
            idColumnSelect.appendChild(opt);
        });
        if (currentVal && headers.includes(currentVal)) idColumnSelect.value = currentVal;
    }

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = ''; // Reset for same file selection
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    function handleFiles(files) {
        const csvFiles = Array.from(files).filter(file => file.name.endsWith('.csv'));
        
        if (csvFiles.length === 0) return;

        uploadedFiles = [...uploadedFiles, ...csvFiles];
        updateUI();
    }

    function removeFile(index) {
        uploadedFiles.splice(index, 1);
        updateUI();
    }

    clearAllBtn.addEventListener('click', () => {
        uploadedFiles = [];
        mergedData = null;
        previewSection.classList.add('hidden');
        updateUI();
    });

    // --- UI Logic ---

    function updateUI() {
        // Update badge
        fileCountBadge.textContent = uploadedFiles.length;

        // Enable/Disable merge button
        mergeBtn.disabled = uploadedFiles.length < 2;

        // Render file list
        if (uploadedFiles.length === 0) {
            fileListContainer.innerHTML = `
                <div class="empty-state">
                    <p>ยังไม่มีไฟล์ที่ถูกเลือก</p>
                </div>
            `;
        } else {
            fileListContainer.innerHTML = '';
            uploadedFiles.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.innerHTML = `
                    <i data-lucide="file-text" style="color: var(--primary)"></i>
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${formatBytes(file.size)}</span>
                    </div>
                    <button class="btn-remove" data-index="${index}">
                        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
                    </button>
                `;
                fileListContainer.appendChild(item);
            });
            lucide.createIcons();
            
            // Add listeners to remove buttons
            document.querySelectorAll('.btn-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.getAttribute('data-index'));
                    removeFile(idx);
                });
            });
        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    const fillNullCheck = document.getElementById('fill-null-check');
    const fillNullValue = document.getElementById('fill-null-value');

    // --- Advanced Processing Logic ---

    mergeBtn.addEventListener('click', async () => {
        mergeBtn.disabled = true;
        mergeBtn.innerHTML = `<i data-lucide="loader" class="spin"></i> กำลังล้างข้อมูล...`;
        lucide.createIcons();

        try {
            const allResults = await Promise.all(uploadedFiles.map(parseCSV));
            const idCol = idColumnSelect.value;
            const mode = document.querySelector('input[name="merge-mode"]:checked').value;
            const nullVal = fillNullValue.value || "0";

            let processedData = [];

            // 1. Union of all headers to prevent missing columns
            const allHeaders = [...new Set(allResults.flatMap(res => res.meta.fields.map(f => f.trim())))];

            // 2. Normalize and Clean Data
            const cleanedResults = allResults.map(res => {
                return res.data.map(row => {
                    const cleanedRow = {};
                    allHeaders.forEach(header => {
                        let val = row[header];
                        if (val === undefined || val === null || val === "") {
                            val = fillNullCheck.checked ? nullVal : "";
                        }
                        if (typeof val === 'string') val = val.trim();
                        cleanedRow[header] = val;
                    });
                    return cleanedRow;
                });
            });

            // 3. Merge Processing
            if (mode === 'append') {
                cleanedResults.forEach(data => {
                    processedData = processedData.concat(data);
                });

                if (dedupeCheck.checked) {
                    const seen = new Set();
                    const unique = [];
                    for (let i = processedData.length - 1; i >= 0; i--) {
                        const idValue = String(processedData[i][idCol] || '').toLowerCase();
                        if (!seen.has(idValue)) {
                            seen.add(idValue);
                            unique.push(processedData[i]);
                        }
                    }
                    processedData = unique.reverse();
                }
            } else if (mode === 'ensemble') {
                const groups = new Map();
                const numericCols = allHeaders.filter(f => f !== idCol);

                cleanedResults.forEach(data => {
                    data.forEach(row => {
                        const id = String(row[idCol] || '').toLowerCase();
                        if (!groups.has(id)) groups.set(id, []);
                        groups.get(id).push(row);
                    });
                });

                groups.forEach((rows, id) => {
                    const averagedRow = { [idCol]: rows[0][idCol] };
                    numericCols.forEach(col => {
                        let sum = 0, count = 0;
                        rows.forEach(r => {
                            const val = parseFloat(r[col]);
                            if (!isNaN(val)) { sum += val; count++; }
                        });
                        if (count > 0) averagedRow[col] = (sum / count).toString();
                        else averagedRow[col] = fillNullCheck.checked ? nullVal : (rows[0][col] || "");
                    });
                    processedData.push(averagedRow);
                });
            }

            // 4. Auto Sort
            if (sortCheck.checked) {
                processedData.sort((a, b) => {
                    const valA = isNaN(a[idCol]) ? String(a[idCol]) : parseFloat(a[idCol]);
                    const valB = isNaN(b[idCol]) ? String(b[idCol]) : parseFloat(b[idCol]);
                    return valA > valB ? 1 : -1;
                });
            }

            mergedData = processedData;
            showPreview(mergedData);
        } catch (err) {
            console.error(err);
            alert('❌ เกิดข้อผิดพลาด: ' + err.message);
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.innerHTML = `<i data-lucide="zap"></i> รวมร่างไฟล์ทั้งหมด`;
            lucide.createIcons();
        }
    });

    function parseCSV(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results),
                error: (error) => reject(error)
            });
        });
    }

    function showPreview(data) {
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);
        const sample = data.slice(0, 10);

        // Build header
        let html = '<thead><tr>';
        headers.forEach(h => {
            html += `<th>${h}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Build body
        sample.forEach(row => {
            html += '<tr>';
            headers.forEach(h => {
                html += `<td>${row[h] || ''}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';

        previewTable.innerHTML = html;
        previewInfo.textContent = `จำนวนข้อมูลทั้งหมด: ${data.length.toLocaleString()} แถว | ${headers.length} คอลัมน์`;
        
        previewSection.classList.remove('hidden');
        previewSection.scrollIntoView({ behavior: 'smooth' });
    }

    // --- Download Logic ---

    downloadBtn.addEventListener('click', () => {
        if (!mergedData) return;

        const csv = Papa.unparse(mergedData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `merged_kaggle_data_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
