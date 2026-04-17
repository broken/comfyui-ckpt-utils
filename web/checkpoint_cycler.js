import { app } from "../../scripts/app.js";

let cyclerMetadata = null;

async function fetchMetadata() {
    if (cyclerMetadata) return cyclerMetadata;
    try {
        const response = await fetch("/comfyui-ckpt-utils/cycler-metadata");
        cyclerMetadata = await response.json();
    } catch (e) {
        console.error("Failed to fetch cycler metadata", e);
        cyclerMetadata = { base_models: ["Any"], tags: [], checkpoints: [] };
    }
    return cyclerMetadata;
}

// Client-side filtering to preview match count dynamically in the modal
function calculateMatches(node, overrideKey, overrideValue) {
    if (!cyclerMetadata) return 0;
    
    const getVal = (name) => {
        if (name === overrideKey) return overrideValue;
        const w = node.widgets.find(x => x.name === name);
        return w ? w.value : "";
    };

    const b_models = getVal("base_models").split(",").map(x => x.trim()).filter(x => x);
    const inc_t = getVal("tags_include").toLowerCase().split(",").map(x => x.trim()).filter(x => x);
    const exc_t = getVal("tags_exclude").toLowerCase().split(",").map(x => x.trim()).filter(x => x);
    const inc_f = getVal("folders_include").toLowerCase().split(",").map(x => x.trim()).filter(x => x && x !== "any");
    const exc_f = getVal("folders_exclude").toLowerCase().split(",").map(x => x.trim()).filter(x => x && x !== "any");

    let count = 0;
    for (let c of cyclerMetadata.checkpoints) {
        if (!b_models.includes("Any") && b_models.length > 0 && !b_models.includes(c.base_model)) continue;
        
        let hasIncT = inc_t.length === 0 || inc_t.every(t => c.tags.includes(t));
        if (!hasIncT) continue;
        
        let hasExcT = exc_t.length > 0 && exc_t.some(t => c.tags.includes(t));
        if (hasExcT) continue;
        
        let hasIncF = inc_f.length === 0 || inc_f.some(f => c.folder.includes(f));
        if (!hasIncF) continue;
        
        let hasExcF = exc_f.length > 0 && exc_f.some(f => c.folder.includes(f));
        if (hasExcF) continue;
        
        count++;
    }
    return count;
}

function showMultiSelectModal(title, options, currentSelectionStr, targetWidgetName, parentNode) {
    const dialog = document.createElement("dialog");
    dialog.style.backgroundColor = "var(--comfy-menu-bg)";
    dialog.style.color = "var(--fg-color)";
    dialog.style.border = "1px solid var(--border-color)";
    dialog.style.borderRadius = "8px";
    dialog.style.padding = "20px";
    dialog.style.minWidth = "400px";
    dialog.style.boxShadow = "0 5px 15px rgba(0,0,0,0.5)";
    
    // Header
    const headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.alignItems = "center";
    headerRow.style.marginBottom = "10px";

    const titleEl = document.createElement("h3");
    titleEl.innerText = title;
    titleEl.style.margin = "0";
    
    const countEl = document.createElement("span");
    countEl.style.fontWeight = "bold";
    countEl.style.color = "var(--error-text)";
    
    headerRow.appendChild(titleEl);
    headerRow.appendChild(countEl);
    dialog.appendChild(headerRow);

    // Search Box
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search...";
    searchInput.style.width = "100%";
    searchInput.style.marginBottom = "10px";
    searchInput.style.padding = "5px";
    searchInput.style.boxSizing = "border-box";
    searchInput.style.backgroundColor = "var(--comfy-input-bg)";
    searchInput.style.color = "var(--input-text)";
    searchInput.style.border = "1px solid var(--border-color)";
    dialog.appendChild(searchInput);

    const container = document.createElement("div");
    container.style.maxHeight = "400px";
    container.style.overflowY = "auto";
    container.style.marginBottom = "20px";
    container.style.border = "1px solid var(--bg-color)";
    container.style.padding = "10px";

    const currentSet = new Set(currentSelectionStr.split(",").map(s => s.trim()).filter(s => s));
    const checkmap = {};
    const rowEls = [];
    
    const updateCount = () => {
        const selected = Object.keys(checkmap).filter(k => checkmap[k].checked);
        const matches = calculateMatches(parentNode, targetWidgetName, selected.join(", "));
        countEl.innerText = `Matching Models: ${matches}`;
    };

    options.forEach(opt => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.marginBottom = "5px";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = opt;
        cb.checked = currentSet.has(opt);
        if (opt === "Any" && currentSet.has("Any")) cb.checked = true;

        const lbl = document.createElement("label");
        lbl.innerText = opt;
        lbl.style.marginLeft = "8px";
        lbl.style.cursor = "pointer";
        
        lbl.onclick = () => { cb.checked = !cb.checked; updateCount(); };
        cb.onchange = () => { updateCount(); }

        row.appendChild(cb);
        row.appendChild(lbl);
        container.appendChild(row);

        checkmap[opt] = cb;
        rowEls.push({ el: row, text: opt.toLowerCase() });
    });

    searchInput.onkeyup = () => {
        const query = searchInput.value.toLowerCase().trim();
        rowEls.forEach(r => {
            if (r.text.includes(query)) r.el.style.display = "flex";
            else r.el.style.display = "none";
        });
    };

    dialog.appendChild(container);

    const btnContainer = document.createElement("div");
    btnContainer.style.display = "flex";
    btnContainer.style.justifyContent = "flex-end";
    btnContainer.style.gap = "10px";

    const saveBtn = document.createElement("button");
    saveBtn.innerText = "Save";
    saveBtn.style.cursor = "pointer";
    saveBtn.onclick = () => {
        const selected = Object.keys(checkmap).filter(k => checkmap[k].checked);
        const targetWidget = parentNode.widgets.find(w => w.name === targetWidgetName);
        if(targetWidget) targetWidget.value = selected.join(", ");
        dialog.close();
        dialog.remove();
        
        // Also update node matching state
        const numMatches = calculateMatches(parentNode, null, null);
        const mWidget = parentNode.widgets.find(w => w.name === "total_matching_models");
        if(mWidget) mWidget.value = `Available cycle matches: ${numMatches}`;
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => {
        dialog.close();
        dialog.remove();
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    dialog.appendChild(btnContainer);

    document.body.appendChild(dialog);
    dialog.showModal();
    updateCount();
}

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Checkpoint Cycler") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Let the selected list be apparent! Make string widgets read-only but VISIBLE.
                const lockWidgets = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                this.widgets.forEach(w => {
                    if (lockWidgets.includes(w.name)) {
                        // They remain visible so the chosen sets are visible. Disable typing.
                        // Comfyui widgets lack an explicit disable flag universally, but replacing their input visually works.
                        if (w.inputEl) {
                            w.inputEl.readOnly = true;
                            w.inputEl.style.opacity = "0.7";
                        }
                    }
                });

                // Fetch metadata asynchronously
                fetchMetadata().then(() => {
                    let mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget) {
                        mWidget.value = `Available cycle matches: ${calculateMatches(this)}`;
                    }
                });

                // Matching models display static widget
                this.addWidget("text", "total_matching_models", "Fetching database...", () => {});
                const mw = this.widgets.find(w => w.name === "total_matching_models");
                if (mw && mw.inputEl) {
                    mw.inputEl.readOnly = true;
                    mw.inputEl.style.color = "var(--error-text)";
                    mw.inputEl.style.fontWeight = "bold";
                }

                // Add Base Models Manage Button
                this.addWidget("button", "btn_base_models", "Configure Base Models", async () => {
                    const md = await fetchMetadata();
                    const w = this.widgets.find((w) => w.name === "base_models");
                    showMultiSelectModal("Select Base Models", md.base_models, w.value, "base_models", this);
                });

                // Add Tags Manage Buttons
                this.addWidget("button", "btn_tags_inc", "Configure Tags (Include)", async () => {
                    const md = await fetchMetadata();
                    const w = this.widgets.find((w) => w.name === "tags_include");
                    showMultiSelectModal("Select Tags to INCLUDE", md.tags, w.value, "tags_include", this);
                });

                this.addWidget("button", "btn_tags_exc", "Configure Tags (Exclude)", async () => {
                    const md = await fetchMetadata();
                    const w = this.widgets.find((w) => w.name === "tags_exclude");
                    showMultiSelectModal("Select Tags to EXCLUDE", md.tags, w.value, "tags_exclude", this);
                });

                // Add Folders Manage Buttons
                const getFolders = () => {
                    const ckptWidget = this.widgets.find((w) => w.name === "ckpt_name");
                    if (!ckptWidget) return ["Any"];
                    const allCkpts = ckptWidget.options.values.filter(v => v !== "Auto (Cycle)");
                    let folders = new Set();
                    folders.add("Any");
                    allCkpts.forEach(c => {
                        let parts = c.split(/[\\/]/);
                        if(parts.length > 1) {
                            folders.add(parts.slice(0, -1).join("/"));
                        }
                    });
                    return Array.from(folders).sort();
                };

                this.addWidget("button", "btn_folders_inc", "Configure Folders (Include)", () => {
                    const w = this.widgets.find((w) => w.name === "folders_include");
                    showMultiSelectModal("Select Folders to INCLUDE", getFolders(), w.value, "folders_include", this);
                });

                this.addWidget("button", "btn_folders_exc", "Configure Folders (Exclude)", () => {
                    const w = this.widgets.find((w) => w.name === "folders_exclude");
                    showMultiSelectModal("Select Folders to EXCLUDE", getFolders(), w.value, "folders_exclude", this);
                });

                // Add Reset Cycle Button
                this.addWidget("button", "reset_cycle", "Restart Cycle (Set index to 1)", () => {
                    const currentIndexWidget = this.widgets.find((w) => w.name === "current_index");
                    if (currentIndexWidget) {
                        currentIndexWidget.value = 1;
                    }
                });

                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);

                if (message.current_index) {
                    const idxWidget = this.widgets.find((w) => w.name === "current_index");
                    if (idxWidget) idxWidget.value = message.current_index[0];
                }
                
                if (message.total_count) {
                    const mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget) mWidget.value = `Available cycle matches: ${message.total_count[0]}`;
                }

                if (message.last_selected_ckpt) {
                    const ckptWidget = this.widgets.find((w) => w.name === "last_selected_ckpt");
                    if (ckptWidget) ckptWidget.value = message.last_selected_ckpt[0];
                }
            };
        }
    }
});
