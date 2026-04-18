import { app } from "../../scripts/app.js";

window.CHECKPOINT_CYCLER_LOADED = true;
console.log("%c[CheckpointCycler] JS EXTENSION STARTING", "background: #222; color: #bada55; font-size: 20px;");
console.log("[CheckpointCycler] Loading checkpoint_cycler.js extension...");

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
        const w = node.widgets.find(function(x) { return x.name === name; });
        return w ? w.value : "";
    };

    const b_models = String(getVal("base_models") || "").split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const inc_t = String(getVal("tags_include") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const exc_t = String(getVal("tags_exclude") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const inc_f = String(getVal("folders_include") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const exc_f = String(getVal("folders_exclude") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });

    let count = 0;
    for (let i = 0; i < cyclerMetadata.checkpoints.length; i++) {
        const c = cyclerMetadata.checkpoints[i];
        if (b_models.length > 0 && !b_models.includes(c.base_model)) continue;
        
        const hasIncT = inc_t.length === 0 || inc_t.every(function(t) { return c.tags && c.tags.indexOf(t) !== -1; });
        if (!hasIncT) continue;
        
        const hasExcT = exc_t.length > 0 && exc_t.some(function(t) { return c.tags && c.tags.indexOf(t) !== -1; });
        if (hasExcT) continue;
        
        const hasIncF = inc_f.length === 0 || inc_f.some(function(f) { return c.folder && c.folder.indexOf(f) !== -1; });
        if (!hasIncF) continue;
        
        const hasExcF = exc_f.length > 0 && exc_f.some(function(f) { return c.folder && c.folder.indexOf(f) !== -1; });
        if (hasExcF) continue;
        
        count++;
    }
    return count;
}

const styles = ".lm-modal-backdrop { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); font-family: sans-serif; } " +
".lm-modal { background: #1e1e1e; border: 1px solid #333; border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); width: 450px; max-width: 90%; max-height: 80vh; display: flex; flex-direction: column; color: #eee; overflow: hidden; } " +
".lm-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; background: #252525; border-bottom: 1px solid #333; } " +
".lm-modal-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0; } " +
".lm-modal-close { background: transparent; border: none; color: #888; font-size: 24px; cursor: pointer; padding: 4px; } " +
".lm-modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 4px; } " +
".lm-modal-search { width: 100%; padding: 12px 16px; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; color: #fff; margin-bottom: 16px; box-sizing: border-box; outline: none; } " +
".lm-checkbox-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 6px; cursor: pointer; color: #ccc; font-size: 14px; } " +
".lm-checkbox-item:hover { background: #333; color: #fff; } " +
".lm-checkbox-count { opacity: 0.5; font-size: 12px; margin-left: auto; background: #2a2a2a; padding: 2px 8px; border-radius: 12px; } " +
".cc-dom-container { padding: 12px; background: rgba(40, 44, 52, 0.6); border-radius: 4px; height: 100%; display: flex; flex-direction: column; overflow-y: auto; box-sizing: border-box; color: #fff; gap: 16px; font-family: sans-serif; } " +
".cc-section { display: flex; flex-direction: column; gap: 8px; } " +
".cc-section-header { display: flex; align-items: center; justify-content: space-between; } " +
".cc-section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; opacity: 0.6; } " +
".cc-edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: transparent; border: none; color: inherit; font-size: 11px; cursor: pointer; opacity: 0.6; border-radius: 3px; } " +
".cc-edit-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.05); } " +
".cc-chips-container { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; } " +
".cc-chip { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap; border: 1px solid transparent; } " +
".cc-chip-base { background: rgba(66, 153, 225, 0.15); border-color: rgba(66, 153, 225, 0.4); color: #4299e1; } " +
".cc-chip-include { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #10b981; } " +
".cc-chip-exclude { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #ef4444; } " +
".cc-chip-count { opacity: 0.6; font-size: 10px; margin-left: 4px; } " +
".cc-empty { font-size: 10px; opacity: 0.3; font-style: italic; width: 100%; text-align: center; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px; }";

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
    header.innerHTML = '<h2 class="lm-modal-title">' + title + '</h2><button class="lm-modal-close">×</button>';
    
    const body = document.createElement("div");
    body.className = "lm-modal-body";
    
    const search = document.createElement("input");
    search.className = "lm-modal-search";
    search.placeholder = "Search...";
    body.appendChild(search);
    
    const listContainer = document.createElement("div");
    body.appendChild(listContainer);
    
    const renderList = function(filterText) {
        listContainer.innerHTML = "";
        const lowerFilter = filterText.toLowerCase();
        
        items.forEach(function(item) {
            const name = item.name || "(Empty)";
            if (lowerFilter && name.toLowerCase().indexOf(lowerFilter) === -1) return;
            
            const label = document.createElement("label");
            label.className = "lm-checkbox-item";
            
            const cb = document.createElement("input");
            cb.type = "checkbox";
            const itemNameStr = item.name || "";
            cb.checked = currentSelection.has(itemNameStr);
            cb.onchange = function(e) {
                if (e.target.checked) currentSelection.add(itemNameStr);
                else currentSelection.delete(itemNameStr);
            };
            
            const textSpan = document.createElement("span");
            textSpan.textContent = name;
            
            const countSpan = document.createElement("span");
            countSpan.className = "lm-checkbox-count";
            countSpan.textContent = item.count;
            
            label.appendChild(cb);
            label.appendChild(textSpan);
            label.appendChild(countSpan);
            listContainer.appendChild(label);
        });
    };
    
    search.oninput = function(e) { renderList(e.target.value); };
    
    const closeAndSave = function() {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        onSave(Array.from(currentSelection));
    };
    
    header.querySelector(".lm-modal-close").onclick = closeAndSave;
    backdrop.onclick = function(e) { if (e.target === backdrop) closeAndSave(); };
    
    renderList("");
    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    search.focus();
}

function getAvailableCounts(node, fieldName) {
    if (!cyclerMetadata || !cyclerMetadata.checkpoints) return {};
    const counts = {};
    cyclerMetadata.checkpoints.forEach(function(c) {
        let values = [];
        if (fieldName === "base_models") values = [c.base_model || "Unknown"];
        else if (fieldName.indexOf("tags") !== -1) values = c.tags || [];
        else if (fieldName.indexOf("folders") !== -1) values = c.folder ? [c.folder] : [];
        
        values.forEach(function(v) {
            if (v !== undefined && v !== null) counts[v] = (counts[v] || 0) + 1;
        });
    });
    return counts;
}

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",

    getCustomWidgets() {
        console.log("[CheckpointCycler] getCustomWidgets() executed");
        const createHiddenDataWidget = function(node, inputName, inputData) {
            console.log("[CheckpointCycler] Adding hidden widget:", inputName);
            const w = {
                type: "text",
                name: inputName,
                value: inputData[1] && inputData[1].default ? inputData[1].default : "",
                options: { serialize: true },
                computeSize: function() { return [0, -4]; }
            };
            if (!node.widgets) node.widgets = [];
            node.widgets.push(w);
            return { widget: w };
        };

        return {
            CC_BASE_MODELS: createHiddenDataWidget,
            CC_TAGS_INCLUDE: createHiddenDataWidget,
            CC_TAGS_EXCLUDE: createHiddenDataWidget,
            CC_FOLDERS_INCLUDE: createHiddenDataWidget,
            CC_FOLDERS_EXCLUDE: createHiddenDataWidget
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Checkpoint Cycler") {
            // Remove the custom filter fields from the required inputs so ComfyUI doesn't create slots (dots)
            if (nodeData.input && nodeData.input.required) {
                const toRemove = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                toRemove.forEach(function(name) {
                    if (nodeData.input.required[name]) delete nodeData.input.required[name];
                });
            }

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                console.log("[CheckpointCycler] onNodeCreated...");
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                var self = this;

                const updateCountDisplay = function() {
                    const mWidget = self.widgets.find(function(w) { return w.name === "total_matching_models"; });
                    if (mWidget && cyclerMetadata) {
                        mWidget.value = calculateMatches(self);
                    } 
                };

                const initialPoll = async function() {
                    await fetchMetadata();
                    const mWidget = self.widgets.find(function(w) { return w.name === "total_matching_models"; });
                    if (mWidget && cyclerMetadata) {
                        updateCountDisplay();
                        app.graph.setDirtyCanvas(true, true);
                    } else if (mWidget) {
                        mWidget.value = "Waiting for background scanner...";
                        setTimeout(initialPoll, 2000);
                    }
                };
                initialPoll();

                this.addWidget("text", "total_matching_models", "Connecting to database...", function() {});
                const mw = this.widgets.find(function(w) { return w.name === "total_matching_models"; });
                if (mw && mw.inputEl) {
                    mw.inputEl.readOnly = true;
                    mw.inputEl.style.color = "#4a9eff";
                }
                
                const setupDOMWidget = function() {
                    console.log("[CheckpointCycler] setupDOMWidget...");
                    injectStyles();
                    try {
                        const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                        const container = document.createElement("div");
                        container.className = "cc-dom-container";
                        container.addEventListener("wheel", function(e) { e.stopPropagation(); });
                        container.addEventListener("pointerdown", function(e) { if (e.pointerType !== "mouse" || e.button !== 1) e.stopPropagation(); });

                        const renderSections = function() {
                            container.innerHTML = "";
                            multiCombos.forEach(function(wName) {
                                const internalW = self.widgets.find(function(x) { return x.name === wName; });
                                if (!internalW) return;
                                
                                internalW.type = "hidden";
                                if (internalW.inputEl) {
                                    internalW.inputEl.style.display = "none";
                                    internalW.inputEl.remove();
                                    internalW.inputEl = null;
                                }
                                
                                const section = document.createElement("div");
                                section.className = "cc-section";
                                const header = document.createElement("div");
                                header.className = "cc-section-header";
                                const title = document.createElement("span");
                                title.className = "cc-section-title";
                                title.textContent = wName.replace(/_/g, " ");
                                
                                const editBtn = document.createElement("button");
                                editBtn.className = "cc-edit-btn";
                                editBtn.innerHTML = "Edit";
                                editBtn.onclick = function() {
                                    const counts = getAvailableCounts(self, wName);
                                    const allNames = Object.keys(counts).sort(function(a,b) { return counts[b] - counts[a]; });
                                    const items = allNames.map(function(n) { return {name: n, count: counts[n]}; });
                                    const selected = String(internalW.value || "").split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
                                    
                                    openModal("Select " + wName.toUpperCase(), items, selected, function(newSelection) {
                                        internalW.value = newSelection.join(", ");
                                        updateCountDisplay();
                                        renderSections();
                                        app.graph.setDirtyCanvas(true, true);
                                    });
                                };
                                
                                header.appendChild(title);
                                header.appendChild(editBtn);
                                section.appendChild(header);
                                
                                const chipsCont = document.createElement("div");
                                chipsCont.className = "cc-chips-container";
                                const selected = String(internalW.value || "").split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
                                if (selected.length === 0) {
                                    const empty = document.createElement("div");
                                    empty.className = "cc-empty";
                                    empty.textContent = "No filters";
                                    chipsCont.appendChild(empty);
                                } else {
                                    const isExclude = wName.indexOf("exclude") !== -1;
                                    const chipCls = wName === "base_models" ? "cc-chip-base" : (isExclude ? "cc-chip-exclude" : "cc-chip-include");
                                    const counts = getAvailableCounts(self, wName);
                                    selected.forEach(function(sel) {
                                        const chip = document.createElement("div");
                                        chip.className = "cc-chip " + chipCls;
                                        chip.textContent = sel + (counts[sel] ? " (" + counts[sel] + ")" : "");
                                        chipsCont.appendChild(chip);
                                    });
                                }
                                section.appendChild(chipsCont);
                                container.appendChild(section);
                            });
                        };

                        renderSections();
                        const domW = self.addDOMWidget("cc_ui", "CC_UI", container, {
                            serialize: false,
                            getValue: function() { return ""; },
                            setValue: function(v) { renderSections(); }
                        });
                        domW.computeSize = function() { return [Math.max(340, self.size[0]), 300]; };
                        self.setSize([Math.max(self.size[0], 340), domW.computeSize()[1]]);
                    } catch (err) {
                        console.error("[CheckpointCycler] setupDOMWidget error:", err);
                    }
                };

                this.widgets = this.widgets.filter(function(w) { return w.type !== "button" || (!w.name.startsWith("+ Edit") && w.name !== "reset_cycle"); });

                requestAnimationFrame(function() {
                    if (!self.widgets.find(function(w) { return w.name === "cc_ui"; })) {
                        setupDOMWidget();
                        self.addWidget("button", "reset_cycle", "Restart Cycle", function() {
                            const ciw = self.widgets.find(function(w) { return w.name === "current_index"; });
                            if (ciw) ciw.value = 0;
                        });
                        app.graph.setDirtyCanvas(true, true);
                    }
                });
                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                const self = this;
                requestAnimationFrame(function() {
                    const multi = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                    if (self.widgets) {
                        self.widgets.forEach(function(w) {
                            if (multi.indexOf(w.name) !== -1) {
                                w.type = "hidden";
                                w.computeSize = function() { return [0, -4]; };
                                if (w.inputEl) {
                                    w.inputEl.style.display = "none";
                                    w.inputEl.remove();
                                    w.inputEl = null;
                                }
                            }
                        });
                    }
                    const uiw = self.widgets.find(function(w) { return w.name === "cc_ui"; });
                    if (uiw && uiw.options && uiw.options.setValue) uiw.options.setValue("");
                    app.graph.setDirtyCanvas(true, true);
                });
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);

                if (message.current_index) {
                    const idxWidget = this.widgets.find(function(w) { return w.name === "current_index"; });
                    if (idxWidget) idxWidget.value = message.current_index[0];
                }
                
                if (message.total_count) {
                    const mWidget = this.widgets.find(function(w) { return w.name === "total_matching_models"; });
                    if (mWidget) {
                        mWidget.value = message.total_count[0];
                    }
                }

                if (message.last_selected_ckpt) {
                    const ckptWidget = this.widgets.find(function(w) { return w.name === "last_selected_ckpt"; });
                    if (ckptWidget) ckptWidget.value = message.last_selected_ckpt[0];
                }
            };
        }
    }
});
