import { app } from "../../scripts/app.js";

function showMultiSelectModal(title, allOptions, currentSelectionStr, onRenderOptions, onSave) {
    const dialog = document.createElement("dialog");
    dialog.style.backgroundColor = "var(--comfy-menu-bg)";
    dialog.style.color = "var(--fg-color)";
    dialog.style.border = "1px solid var(--border-color)";
    dialog.style.borderRadius = "8px";
    dialog.style.padding = "20px";
    dialog.style.minWidth = "300px";
    dialog.style.boxShadow = "0 5px 15px rgba(0,0,0,0.5)";

    const titleEl = document.createElement("h3");
    titleEl.innerText = title;
    titleEl.style.marginTop = "0";
    dialog.appendChild(titleEl);

    // Call dynamic function to list options if provided
    const options = onRenderOptions ? onRenderOptions() : allOptions;

    const container = document.createElement("div");
    container.style.maxHeight = "400px";
    container.style.overflowY = "auto";
    container.style.marginBottom = "20px";
    container.style.border = "1px solid var(--bg-color)";
    container.style.padding = "10px";

    const currentSet = new Set(currentSelectionStr.split(",").map(s => s.trim()).filter(s => s));

    const checkmap = {};
    
    options.forEach(opt => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.marginBottom = "5px";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = opt;
        cb.checked = currentSet.has(opt);

        const lbl = document.createElement("label");
        lbl.innerText = opt;
        lbl.style.marginLeft = "8px";
        lbl.style.cursor = "pointer";
        
        lbl.onclick = () => { cb.checked = !cb.checked; };

        row.appendChild(cb);
        row.appendChild(lbl);
        container.appendChild(row);

        checkmap[opt] = cb;
    });

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
        onSave(selected.join(", "));
        dialog.close();
        dialog.remove();
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
}

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Checkpoint Cycler") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Hide string widgets so we can replace them visually with pretty buttons
                const hideWidgets = ["base_models", "folders_include", "folders_exclude"];
                this.widgets.forEach(w => {
                    if (hideWidgets.includes(w.name)) {
                        w.type = "hidden"; // Marks as hidden in standard ComfyUI UI 
                        w.computeSize = () => [0, -4];
                    }
                });

                this.addWidget("button", "btn_base_models", "Select Base Models", () => {
                    const bmWidget = this.widgets.find((w) => w.name === "base_models");
                    const allModels = ["Any", "SD1.5", "SDXL", "SD3", "Flux", "SDXL-Turbo", "Pony", "HunyuanVideo", "Unknown"];
                    showMultiSelectModal("Select Base Models", allModels, bmWidget.value, null, (newVal) => {
                        bmWidget.value = newVal || "Any";
                    });
                });

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
                    const fIncWidget = this.widgets.find((w) => w.name === "folders_include");
                    showMultiSelectModal("Select Folders to INCLUDE", [], fIncWidget.value, getFolders, (newVal) => {
                        fIncWidget.value = newVal;
                    });
                });

                this.addWidget("button", "btn_folders_exc", "Configure Folders (Exclude)", () => {
                    const fExcWidget = this.widgets.find((w) => w.name === "folders_exclude");
                    showMultiSelectModal("Select Folders to EXCLUDE", [], fExcWidget.value, getFolders, (newVal) => {
                        fExcWidget.value = newVal;
                    });
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

                // Update current index for the next generation
                if (message.current_index) {
                    const idxWidget = this.widgets.find((w) => w.name === "current_index");
                    if (idxWidget) {
                        idxWidget.value = message.current_index[0];
                    }
                }

                // Update the hidden state for last checked model
                if (message.last_selected_ckpt) {
                    const ckptWidget = this.widgets.find((w) => w.name === "last_selected_ckpt");
                    if (ckptWidget) {
                        ckptWidget.value = message.last_selected_ckpt[0];
                    }
                }
            };
        }
    }
});
