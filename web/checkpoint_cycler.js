import { app } from "../../scripts/app.js";

let cyclerMetadata = null;
let fetchOngoing = null;

async function fetchMetadata() {
    // If we already have a populated cache, use it!
    // But if checkpoints are empty, maybe the LoraManager backend scanner hasn't finished, so retry.
    if (cyclerMetadata && cyclerMetadata.checkpoints && cyclerMetadata.checkpoints.length > 0) {
        return cyclerMetadata;
    }
    
    if (fetchOngoing) return await fetchOngoing;
    
    fetchOngoing = (async () => {
        try {
            const response = await fetch("/comfyui-ckpt-utils/cycler-metadata");
            const json = await response.json();
            if (json.error) {
                console.error("API Error: ", json.error);
            } else {
                cyclerMetadata = json;
            }
        } catch (e) {
            console.error("Failed to fetch cycler metadata", e);
        }
        fetchOngoing = null;
        return cyclerMetadata || { base_models: ["Any"], tags: [], checkpoints: [] };
    })();
    
    return await fetchOngoing;
}

function calculateMatches(node, overrideKey, overrideValue) {
    if (!cyclerMetadata || !cyclerMetadata.checkpoints) return 0;
    
    const getVal = (name) => {
        if (name === overrideKey) return overrideValue;
        const w = node.widgets.find(x => x.name === name);
        return w ? w.value : "";
    };

    const b_models = (getVal("base_models") || "").split(",").map(x => x.trim()).filter(x => x);
    const inc_t = (getVal("tags_include") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x);
    const exc_t = (getVal("tags_exclude") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x);
    const inc_f = (getVal("folders_include") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x && x !== "any");
    const exc_f = (getVal("folders_exclude") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x && x !== "any");

    let count = 0;
    for (let c of cyclerMetadata.checkpoints) {
        if (!b_models.includes("Any") && b_models.length > 0 && !b_models.includes(c.base_model)) continue;
        
        let hasIncT = inc_t.length === 0 || inc_t.every(t => c.tags && c.tags.includes(t));
        if (!hasIncT) continue;
        
        let hasExcT = exc_t.length > 0 && exc_t.some(t => c.tags && c.tags.includes(t));
        if (hasExcT) continue;
        
        let hasIncF = inc_f.length === 0 || inc_f.some(f => c.folder && c.folder.includes(f));
        if (!hasIncF) continue;
        
        let hasExcF = exc_f.length > 0 && exc_f.some(f => c.folder && c.folder.includes(f));
        if (hasExcF) continue;
        
        count++;
    }
    return count;
}

function showMultiSelectDropdown(x, y, options, currentSelectionStr, node, targetWidgetName, onSave) {
    if (window._myMultiSelectModal) {
        window._myMultiSelectModal.remove();
    }

    const div = document.createElement("div");
    window._myMultiSelectModal = div;
    div.style.position = "absolute";
    div.style.left = x + "px";
    div.style.top = y + "px";
    div.style.backgroundColor = "var(--comfy-menu-bg, #222)";
    div.style.color = "var(--fg-color, #CCC)";
    div.style.border = "1px solid var(--border-color, #444)";
    div.style.zIndex = 10000;
    div.style.padding = "8px";
    div.style.boxShadow = "2px 2px 10px rgba(0,0,0,0.7)";
    div.style.minWidth = "220px";
    div.style.borderRadius = "4px";
    div.style.fontFamily = "Arial, sans-serif";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search...";
    searchInput.style.width = "100%";
    searchInput.style.marginBottom = "8px";
    searchInput.style.boxSizing = "border-box";
    searchInput.style.backgroundColor = "var(--comfy-input-bg, #111)";
    searchInput.style.color = "var(--input-text, #FFF)";
    searchInput.style.border = "1px solid var(--border-color, #333)";
    searchInput.style.padding = "5px";
    searchInput.style.borderRadius = "3px";
    div.appendChild(searchInput);

    const listDiv = document.createElement("div");
    listDiv.style.maxHeight = "250px";
    listDiv.style.overflowY = "auto";
    div.appendChild(listDiv);

    const currentSet = new Set((currentSelectionStr || "").split(",").map(s => s.trim()).filter(s => s));
    const checkmap = {};
    const rowEls = [];

    const updateMatches = () => {
        const selected = Object.keys(checkmap).filter(k => checkmap[k].checked);
        const matches = calculateMatches(node, targetWidgetName, selected.join(", "));
        const mWidget = node.widgets.find(w => w.name === "total_matching_models");
        if (mWidget) mWidget.value = `Available cycle matches: ${matches}`;
    };

    options.forEach(opt => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.marginBottom = "4px";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = opt;
        cb.checked = currentSet.has(opt);
        if (opt === "Any" && currentSet.has("Any")) cb.checked = true;

        const lbl = document.createElement("label");
        lbl.innerText = opt;
        lbl.style.marginLeft = "6px";
        lbl.style.cursor = "pointer";
        lbl.style.fontSize = "13px";
        lbl.style.flex = "1";
        lbl.style.whiteSpace = "nowrap";
        lbl.style.overflow = "hidden";
        lbl.style.textOverflow = "ellipsis";
        
        lbl.onclick = () => { cb.checked = !cb.checked; updateMatches(); };
        cb.onchange = () => { updateMatches(); };

        row.appendChild(cb);
        row.appendChild(lbl);
        listDiv.appendChild(row);

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

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "Apply & Close";
    closeBtn.style.width = "100%";
    closeBtn.style.marginTop = "8px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.backgroundColor = "var(--comfy-input-bg, #333)";
    closeBtn.style.color = "var(--input-text, #FFF)";
    closeBtn.style.border = "1px solid var(--border-color, #444)";
    closeBtn.style.padding = "5px";
    closeBtn.style.borderRadius = "3px";

    const doSave = () => {
        const selected = Object.keys(checkmap).filter(k => checkmap[k].checked);
        onSave(selected.join(", "));
        div.remove();
        window._myMultiSelectModal = null;
        updateMatches(); 
    };

    closeBtn.onclick = doSave;
    div.appendChild(closeBtn);

    document.body.appendChild(div);
    searchInput.focus();

    const clickOutside = (e) => {
        if (!div.contains(e.target)) {
            doSave();
            document.removeEventListener("mousedown", clickOutside);
        }
    };
    setTimeout(() => {
        document.addEventListener("mousedown", clickOutside);
    }, 100);
}

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Checkpoint Cycler") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Fetch metadata asynchronously for the counts over short retry laps
                const initialPoll = async () => {
                    await fetchMetadata();
                    let mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget && cyclerMetadata && cyclerMetadata.checkpoints.length > 0) {
                        mWidget.value = `Available cycle matches: ${calculateMatches(this)}`;
                    } else if (mWidget) {
                        mWidget.value = "Pending background scanner...";
                        setTimeout(initialPoll, 2000);
                    }
                };
                initialPoll();

                this.addWidget("text", "total_matching_models", "Fetching database...", () => {});
                const mw = this.widgets.find(w => w.name === "total_matching_models");
                if (mw && mw.inputEl) {
                    mw.inputEl.readOnly = true;
                    mw.inputEl.style.color = "var(--error-text)";
                    mw.inputEl.style.fontWeight = "bold";
                }

                const targetWidgets = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                this.widgets.forEach(w => {
                    // Fallback cleanse for btn widgets
                    if (w.name.startsWith("btn_")) {
                        w.type = "hidden";
                        w.computeSize = () => [0,-4];
                    }

                    if (targetWidgets.includes(w.name)) {
                        w.type = "combo";
                        w.options = w.options || {};
                        w.options.values = w.options.values || ["Any"];
                        
                        const origMouse = w.mouse;
                        w.mouse = function(event, pos, node) {
                            if (event.type === "mousedown") {
                                const canvas = app.canvas;
                                const rect = canvas.canvas.getBoundingClientRect();
                                const offset_x = rect.left + (node.pos[0] + 15) * canvas.scale + canvas.offset[0] * canvas.scale;
                                const offset_y = rect.top + (node.pos[1] + pos[1] + 25) * canvas.scale + canvas.offset[1] * canvas.scale;
                                
                                // Fetch safely straight off the click event, retrieving dynamically
                                fetchMetadata().then(md => {
                                    let options = [];
                                    if (w.name === "base_models") {
                                        options = md.base_models || ["Any"];
                                    } else if (w.name.startsWith("tags_")) {
                                        options = md.tags || [];
                                    } else if (w.name.startsWith("folders_")) {
                                        const ckptWidget = node.widgets.find((x) => x.name === "ckpt_name");
                                        if (!ckptWidget) options = ["Any"];
                                        else {
                                            const allCkpts = (ckptWidget.options?.values || []).filter(v => v !== "Auto (Cycle)");
                                            let folders = new Set();
                                            folders.add("Any");
                                            allCkpts.forEach(c => {
                                                let parts = c.split(/[\\/]/);
                                                if(parts.length > 1) {
                                                    folders.add(parts.slice(0, -1).join("/"));
                                                }
                                            });
                                            options = Array.from(folders).sort();
                                        }
                                    }

                                    // Display with populated options
                                    showMultiSelectDropdown(offset_x, offset_y, options, w.value, node, w.name, (newVal) => {
                                        if (!newVal) newVal = "Any";
                                        w.value = newVal;
                                        app.graph.setDirtyCanvas(true, true);
                                    });
                                });
                                return true;
                            }
                            return origMouse ? origMouse.apply(this, arguments) : false;
                        };
                    }
                });

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
