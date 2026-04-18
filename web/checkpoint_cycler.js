import { app } from "../../scripts/app.js";

let cyclerMetadata = null;
let fetchOngoing = null;

async function fetchMetadata() {
    if (cyclerMetadata && cyclerMetadata.checkpoints && cyclerMetadata.checkpoints.length > 0) {
        return cyclerMetadata;
    }
    if (fetchOngoing) return await fetchOngoing;
    
    fetchOngoing = (async () => {
        try {
            const response = await fetch("/comfyui-ckpt-utils/cycler-metadata");
            const json = await response.json();
            if (!json.error) cyclerMetadata = json;
        } catch (e) {
            console.error("Failed to fetch cycler metadata", e);
        }
        fetchOngoing = null;
        return cyclerMetadata || { base_models: [""], tags: [""], checkpoints: [] };
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
    const inc_f = (getVal("folders_include") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x);
    const exc_f = (getVal("folders_exclude") || "").toLowerCase().split(",").map(x => x.trim()).filter(x => x);

    let count = 0;
    for (let c of cyclerMetadata.checkpoints) {
        if (b_models.length > 0 && !b_models.includes(c.base_model)) continue;
        
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

const styles = `
.lm-modal-backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.7); display: flex;
    align-items: center; justify-content: center; backdrop-filter: blur(4px);
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}
.lm-modal {
    background: #1e1e1e; border: 1px solid #333;
    border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    width: 450px; max-width: 90%; max-height: 80vh; display: flex; flex-direction: column;
    color: #eee; overflow: hidden;
}
.lm-modal-header {
    display: flex; align-items: center; justify-content: space-between; padding: 20px 24px;
    background: #252525; border-bottom: 1px solid #333;
}
.lm-modal-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0; letter-spacing: -0.01em; }
.lm-modal-close {
    background: transparent; border: none; color: #888; font-size: 24px;
    cursor: pointer; transition: color 0.2s, transform 0.2s; padding: 4px;
}
.lm-modal-close:hover { color: #fff; transform: scale(1.1); }
.lm-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 4px; }
.lm-modal-search { 
    width: 100%; padding: 12px 16px; background: #2a2a2a; border: 1px solid #444; 
    border-radius: 8px; color: #fff; margin-bottom: 16px; box-sizing: border-box; 
    transition: border-color 0.2s, box-shadow 0.2s; outline: none;
}
.lm-modal-search:focus { border-color: #4a9eff; box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2); }
.lm-checkbox-item {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border-radius: 6px; cursor: pointer; color: #ccc; font-size: 14px;
    transition: background 0.15s, color 0.15s;
}
.lm-checkbox-item:hover { background: #333; color: #fff; }
.lm-checkbox-item input { margin: 0; width: 18px; height: 18px; cursor: pointer; accent-color: #4a9eff; }
.lm-checkbox-count { opacity: 0.5; font-size: 12px; margin-left: auto; background: #2a2a2a; padding: 2px 8px; border-radius: 12px; }

/* DOM Widget Styles */
.cc-dom-container {
    padding: 12px;
    background: rgba(40, 44, 52, 0.6);
    border-radius: 4px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    box-sizing: border-box;
    font-family: 'Inter', system-ui, sans-serif;
    color: #fff;
    gap: 16px;
}
.cc-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.cc-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.cc-section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
}
.cc-edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: transparent;
    border: none;
    color: inherit;
    font-size: 11px;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
    border-radius: 3px;
}
.cc-edit-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.05);
}
.cc-chips-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 24px;
}
.cc-chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid transparent;
}
.cc-chip-base {
    background: rgba(66, 153, 225, 0.15);
    border-color: rgba(66, 153, 225, 0.4);
    color: #4299e1;
}
.cc-chip-include {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.4);
    color: #10b981;
}
.cc-chip-exclude {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
}
.cc-chip-count {
    opacity: 0.6;
    font-size: 10px;
    margin-left: 4px;
}
.cc-empty {
    font-size: 10px;
    opacity: 0.3;
    font-style: italic;
    width: 100%;
    text-align: center;
    background: rgba(0,0,0,0.2);
    padding: 6px;
    border-radius: 4px;
}
`;

function injectStyles() {
    if (!document.getElementById("ckpt-cycler-styles")) {
        const style = document.createElement("style");
        style.id = "ckpt-cycler-styles";
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

function openModal(title, items, selectedItems, onSave) {
    injectStyles();
    
    let currentSelection = new Set(selectedItems);
    
    const backdrop = document.createElement("div");
    backdrop.className = "lm-modal-backdrop";
    
    const modal = document.createElement("div");
    modal.className = "lm-modal";
    
    const header = document.createElement("div");
    header.className = "lm-modal-header";
    header.innerHTML = \`<h2 class="lm-modal-title">\${title}</h2><button class="lm-modal-close">&times;</button>\`;
    
    const body = document.createElement("div");
    body.className = "lm-modal-body";
    
    const search = document.createElement("input");
    search.className = "lm-modal-search";
    search.placeholder = "Search...";
    body.appendChild(search);
    
    const listContainer = document.createElement("div");
    body.appendChild(listContainer);
    
    const renderList = (filterText) => {
        listContainer.innerHTML = "";
        const lowerFilter = filterText.toLowerCase();
        
        items.forEach(item => {
            if (lowerFilter && (item.name || "(Empty)").toLowerCase().indexOf(lowerFilter) === -1) return;
            
            const label = document.createElement("label");
            label.className = "lm-checkbox-item";
            
            const cb = document.createElement("input");
            cb.type = "checkbox";
            const itemNameStr = item.name || "";
            cb.checked = currentSelection.has(itemNameStr);
            cb.onchange = (e) => {
                if (e.target.checked) currentSelection.add(itemNameStr);
                else currentSelection.delete(itemNameStr);
            };
            
            const text = document.createElement("span");
            text.textContent = item.name || "(Empty)";
            
            const count = document.createElement("span");
            count.className = "lm-checkbox-count";
            count.textContent = item.count;
            
            label.appendChild(cb);
            label.appendChild(text);
            label.appendChild(count);
            listContainer.appendChild(label);
        });
    };
    
    search.oninput = (e) => renderList(e.target.value);
    
    const closeAndSave = () => {
        document.body.removeChild(backdrop);
        onSave(Array.from(currentSelection));
    };
    
    header.querySelector(".lm-modal-close").onclick = closeAndSave;
    backdrop.onclick = (e) => {
        if (e.target === backdrop) closeAndSave();
    };
    
    renderList("");
    
    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    search.focus();
}

function getAvailableCounts(node, fieldName) {
    if (!cyclerMetadata || !cyclerMetadata.checkpoints) return {};
    
    const items = cyclerMetadata.checkpoints;
    const counts = {};
    
    items.forEach(c => {
        let values = [];
        if (fieldName === "base_models") values = [c.base_model || "Unknown"];
        else if (fieldName.startsWith("tags")) values = c.tags || [];
        else if (fieldName.startsWith("folders")) values = c.folder ? [c.folder] : [];
        
        values.forEach(v => {
            if (v === undefined || v === null) return;
            counts[v] = (counts[v] || 0) + 1;
        });
    });
    return counts;
}

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",
    
    getCustomWidgets() {
        const createHiddenDataWidget = (node, inputName, inputData) => {
            return {
                widget: node.addWidget(inputData[0], inputName, inputData[1]?.default || "", () => {}, { 
                    serialize: true, 
                    computeSize: () => [0, 0] 
                })
            };
        };

        return {
            CC_BASE_MODELS(node, inputName, inputData, app) { return createHiddenDataWidget(node, inputName, inputData); },
            CC_TAGS_INCLUDE(node, inputName, inputData, app) { return createHiddenDataWidget(node, inputName, inputData); },
            CC_TAGS_EXCLUDE(node, inputName, inputData, app) { return createHiddenDataWidget(node, inputName, inputData); },
            CC_FOLDERS_INCLUDE(node, inputName, inputData, app) { return createHiddenDataWidget(node, inputName, inputData); },
            CC_FOLDERS_EXCLUDE(node, inputName, inputData, app) { return createHiddenDataWidget(node, inputName, inputData); },
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Checkpoint Cycler") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                const updateCountDisplay = () => {
                    const mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget && cyclerMetadata && cyclerMetadata.checkpoints.length > 0) {
                        mWidget.value = \`Available cycle matches: \${calculateMatches(this)}\`;
                    } 
                };

                const initialPoll = async () => {
                    await fetchMetadata();
                    const mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget && cyclerMetadata && cyclerMetadata.checkpoints.length > 0) {
                        updateCountDisplay();
                        app.graph.setDirtyCanvas(true, true);
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
                
                const setupDOMWidget = () => {
                    const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                    if (!this.widgets) return;

                    const container = document.createElement("div");
                    container.className = "cc-dom-container";
                    
                    // Stop mouse events from reaching canvas so we can scroll
                    container.addEventListener("wheel", (e) => e.stopPropagation());
                    container.addEventListener("pointerdown", (e) => {
                        if (e.pointerType !== "mouse" || e.button !== 1) e.stopPropagation();
                    });

                    const renderSections = () => {
                        container.innerHTML = "";
                        multiCombos.forEach(wName => {
                            const internalW = this.widgets.find(x => x.name === wName);
                            if (!internalW) return;
                            internalW.computeSize = () => [0, 0]; // Keep invisible
                            
                            const section = document.createElement("div");
                            section.className = "cc-section";
                            
                            const header = document.createElement("div");
                            header.className = "cc-section-header";
                            
                            const title = document.createElement("span");
                            title.className = "cc-section-title";
                            const cleanName = wName.replace(/_/g, " ");
                            title.textContent = cleanName;
                            
                            const editBtn = document.createElement("button");
                            editBtn.className = "cc-edit-btn";
                            editBtn.innerHTML = \`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit\`;
                            
                            editBtn.onclick = () => {
                                const counts = getAvailableCounts(this, wName);
                                const allNames = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                                const items = allNames.map(n => ({name: n, count: counts[n]}));
                                const selected = (internalW.value || "").split(",").map(x => x.trim()).filter(x => x);
                                
                                openModal("Select " + cleanName.toUpperCase(), items, selected, (newSelection) => {
                                    internalW.value = newSelection.join(", ");
                                    updateCountDisplay();
                                    renderSections();
                                    app.graph.setDirtyCanvas(true, true);
                                });
                            };
                            
                            header.appendChild(title);
                            header.appendChild(editBtn);
                            section.appendChild(header);
                            
                            const chipsContainer = document.createElement("div");
                            chipsContainer.className = "cc-chips-container";
                            
                            const selected = (internalW.value || "").split(",").map(x => x.trim()).filter(x => x);
                            if (selected.length === 0) {
                                const empty = document.createElement("div");
                                empty.className = "cc-empty";
                                empty.textContent = "No filters selected";
                                chipsContainer.appendChild(empty);
                            } else {
                                const isExclude = wName.includes("exclude");
                                const isBase = wName === "base_models";
                                const chipClass = isBase ? "cc-chip-base" : (isExclude ? "cc-chip-exclude" : "cc-chip-include");
                                const counts = getAvailableCounts(this, wName);
                                
                                selected.forEach(sel => {
                                    const chip = document.createElement("div");
                                    chip.className = \`cc-chip \${chipClass}\`;
                                    chip.textContent = sel + (counts[sel] ? \` (\${counts[sel]})\` : "");
                                    chipsContainer.appendChild(chip);
                                });
                            }
                            
                            section.appendChild(chipsContainer);
                            container.appendChild(section);
                        });
                    };

                    renderSections();
                    
                    const domWidget = this.addDOMWidget("cc_ui", "CC_UI", container, {
                        serialize: false,
                        getValue() { return ""; },
                        setValue(v) { renderSections(); }
                    });
                    
                    domWidget.computeSize = () => [Math.max(340, this.size[0]), 300];
                    this.setSize([Math.max(this.size?.[0] || 340, 340), this.computeSize()[1]]);
                };

                // Remove legacy buttons if they exist
                this.widgets = this.widgets.filter(w => w.type !== "button" || (!w.name.startsWith("+ Edit") && w.name !== "reset_cycle"));

                requestAnimationFrame(() => {
                    if (!this.widgets.find(w => w.name === "cc_ui")) {
                        setupDOMWidget();
                        
                        this.addWidget("button", "reset_cycle", "Restart Cycle (Set index to 0)", () => {
                            const currentIndexWidget = this.widgets.find((w) => w.name === "current_index");
                            if (currentIndexWidget) {
                                currentIndexWidget.value = 0;
                            }
                        });
                        
                        app.graph.setDirtyCanvas(true, true);
                    }
                });

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                requestAnimationFrame(() => {
                    const uiWidget = this.widgets.find(w => w.name === "cc_ui");
                    if (uiWidget && uiWidget.options && uiWidget.options.setValue) {
                        uiWidget.options.setValue("");
                    }
                    app.graph.setDirtyCanvas(true, true);
                });
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
                    if (mWidget) mWidget.value = \`Available cycle matches: \${message.total_count[0]}\`;
                }

                if (message.last_selected_ckpt) {
                    const ckptWidget = this.widgets.find((w) => w.name === "last_selected_ckpt");
                    if (ckptWidget) ckptWidget.value = message.last_selected_ckpt[0];
                }
            };
        }
    }
});
