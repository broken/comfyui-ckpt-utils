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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            console.log("[CheckpointCycler] Fetching metadata from server...");
            const response = await fetch("/comfyui-ckpt-utils/cycler-metadata", { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                console.warn("[CheckpointCycler] Metadata fetch failed with status:", response.status);
                return { base_models: [], tags: [], checkpoints: [] };
            }
            const json = await response.json();
            console.log("[CheckpointCycler] Metadata received, checkpoints count:", json.checkpoints ? json.checkpoints.length : 0);
            if (!json.error) cyclerMetadata = json;
            else console.warn("[CheckpointCycler] Metadata JSON error:", json.error);
        } catch (e) {
            console.error("[CheckpointCycler] Failed to fetch cycler metadata:", e.message);
        }
        fetchOngoing = null;
        return cyclerMetadata || { base_models: [], tags: [], checkpoints: [] };
    })();
    return await fetchOngoing;
}

function getFilteredCheckpoints(node) {
    if (!cyclerMetadata || !cyclerMetadata.checkpoints) return [];
    
    const getVal = (name) => {
        const w = node.widgets.find(function(x) { return x.name === name; });
        return w ? w.value : "";
    };

    const b_models = String(getVal("base_models") || "").split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const inc_t = String(getVal("tags_include") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const exc_t = String(getVal("tags_exclude") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const inc_f = String(getVal("folders_include") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const exc_f = String(getVal("folders_exclude") || "").toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(function(x) { return x; });
    const favOnly = !!getVal("favorites_only");

    let filtered = [];
    for (let i = 0; i < cyclerMetadata.checkpoints.length; i++) {
        const c = cyclerMetadata.checkpoints[i];
        if (favOnly && !c.favorite) continue;
        if (b_models.length > 0 && b_models.indexOf(c.base_model) === -1) continue;
        
        const hasIncT = inc_t.length === 0 || inc_t.every(function(t) { return c.tags && c.tags.indexOf(t) !== -1; });
        if (!hasIncT) continue;
        
        const hasExcT = exc_t.length > 0 && exc_t.some(function(t) { return c.tags && c.tags.indexOf(t) !== -1; });
        if (hasExcT) continue;
        
        const hasIncF = inc_f.length === 0 || inc_f.some(function(f) { return c.folder && c.folder.indexOf(f) !== -1; });
        if (!hasIncF) continue;
        
        const hasExcF = exc_f.length > 0 && exc_f.some(function(f) { return c.folder && c.folder.indexOf(f) !== -1; });
        if (hasExcF) continue;
        
        filtered.push(c);
    }
    
    // Match Python sorting logic
    filtered.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return filtered;
}

function calculateMatches(node) {
    return getFilteredCheckpoints(node).length;
}

function syncFromIndex(node, internalOnly) {
    if (node._syncing) return;
    node._syncing = true;
    try {
        const ckptW = node.widgets.find(w => w.name === "ckpt_name");
        const ciw = node.widgets.find(w => w.name === "current_index");
        const repeatsW = node.widgets.find(w => w.name === "repeats");
        if (!ckptW || !ciw) return;
        
        const matches = getFilteredCheckpoints(node);
        if (matches.length === 0) {
            ckptW.options.values = ["(No matches)"];
            ckptW.value = "(No matches)";
            return;
        }
        
        const repeats = repeatsW ? parseInt(repeatsW.value) || 1 : 1;
        const currentVal = parseInt(ciw.value) || 0;
        const totalSteps = matches.length * repeats;
        
        let idx = 0;
        let iteration = 1;
        
        if (totalSteps > 0) {
            const wrappedVal = currentVal % totalSteps;
            idx = Math.floor(wrappedVal / repeats);
            iteration = (wrappedVal % repeats) + 1;
        }
        
        const targetModel = matches[idx];
        
        // Update Status Display
        const statusW = node.widgets.find(w => w.name === "cycler_status");
        if (statusW) {
            statusW.value = `Model ${idx + 1}/${matches.length} | Iter ${iteration}/${repeats}`;
            if (statusW.inputEl) statusW.inputEl.value = statusW.value;
        }
        
        if (targetModel && ckptW.value !== targetModel.name) {
            ckptW.value = targetModel.name;
            if (ckptW.callback && !internalOnly) ckptW.callback(ckptW.value);
        }
    } finally {
        node._syncing = false;
    }
}

function syncFromCkpt(node, internalOnly) {
    if (node._syncing) return;
    node._syncing = true;
    try {
        const ckptW = node.widgets.find(w => w.name === "ckpt_name");
        const ciw = node.widgets.find(w => w.name === "current_index");
        const repeatsW = node.widgets.find(w => w.name === "repeats");
        if (!ckptW || !ciw) return;
        
        const matches = getFilteredCheckpoints(node);
        const modelIdx = matches.findIndex(m => m.name === ckptW.value);
        
        if (modelIdx !== -1) {
            const repeats = repeatsW ? parseInt(repeatsW.value) || 1 : 1;
            const newVal = modelIdx * repeats;
            if (ciw.value !== newVal) {
                ciw.value = newVal;
                if (ciw.callback && !internalOnly) ciw.callback(newVal);
            }
        }
    } finally {
        node._syncing = false;
    }
}

function updateCkptList(node) {
    const ckptW = node.widgets.find(w => w.name === "ckpt_name");
    if (!ckptW) return;
    
    const matches = getFilteredCheckpoints(node);
    const names = matches.map(m => m.name);
    
    // Update combo values
    ckptW.options.values = names.length > 0 ? names : ["(No matches)"];
    
    // Ensure current selection is still valid if possible, otherwise snap to index
    const currentName = ckptW.value;
    if (names.indexOf(currentName) === -1) {
        // Current model no longer valid, snap to whatever the current index points to in the NEW list
        syncFromIndex(node);
    } else {
        // Current model still valid, but its INDEX might have changed in the filtered list
        syncFromCkpt(node);
    }
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
".cc-empty { font-size: 10px; opacity: 0.3; font-style: italic; width: 100%; text-align: center; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px; } " +
'.cc-switch { position: relative; display: inline-block; width: 28px; height: 16px; flex-shrink: 0; } ' +
'.cc-switch input { opacity: 0; width: 0; height: 0; } ' +
'.cc-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .2s; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); } ' +
'.cc-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: #999; transition: .2s; border-radius: 50%; } ' +
'input:checked + .cc-slider { background-color: #4299e1; } ' +
'input:checked + .cc-slider:before { transform: translateX(12px); background-color: #fff; } ' +
'.cc-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; margin-bottom: 6px; } ' +
'.cc-toggle-label { font-size: 11px; font-weight: 500; color: #ccc; cursor: pointer; user-select: none; } ' +
'[data-widget-name="base_models"], [data-widget-name="tags_include"], [data-widget-name="tags_exclude"], [data-widget-name="folders_include"], [data-widget-name="folders_exclude"] { display: none !important; visibility: hidden !important; height: 0 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }';

function injectStyles() {
    if (!document.getElementById("ckpt-cycler-styles")) {
        const style = document.createElement("style");
        style.id = "ckpt-cycler-styles";
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

function openModal(title, items, selectedItems, onSave) {
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

function syncNodeLayout(node) {
    if (!node || !node.widgets) return;
    var custom = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude", "favorites_only"];
    
    // 1. Suppress Inputs (the dots)
    if (node.inputs) {
        for (var i = node.inputs.length - 1; i >= 0; i--) {
            if (custom.indexOf(node.inputs[i].name) !== -1) node.removeInput(i);
        }
    }

    // 2. Hide specific widgets and their DOM layers
    node.widgets.forEach(function(w) {
        if (custom.indexOf(w.name) !== -1) {
            w.type = "hidden";
            w.hidden = true;
            w.draw = function() { return; };
            w.computeSize = function() { return [0, 0]; };
            
            // Just hide the DOM element, do not remove it (keeps order stable)
            if (w.inputEl) {
                w.inputEl.style.display = "none";
                w.inputEl.style.height = "0px";
                w.inputEl.readOnly = true;
            }
        }
    });

    // 3. Force a layout re-calculation using official methods
    if (node.onComputeSize) {
        var sz = node.onComputeSize();
        node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
    }
    if (app.graph) app.graph.setDirtyCanvas(true, true);
}

injectStyles();

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointCycler",

    getCustomWidgets() {
        console.log("[CheckpointCycler] getCustomWidgets() executed");
        const createHiddenDataWidget = function(node, inputName, inputData) {
            console.log("[CheckpointCycler] Adding hidden data widget:", inputName);
            const w = {
                type: "hidden",
                name: inputName,
                value: String(inputData[1] && inputData[1].default ? inputData[1].default : ""),
                options: { serialize: true },
                draw: function() { return; },
                computeSize: function() { return [0, 0]; }
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
            console.log("[CheckpointCycler] beforeRegisterNodeDef matching Checkpoint Cycler");

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                console.log("[CheckpointCycler] onNodeCreated running...");
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                var self = this;
                var sync = function() { syncNodeLayout(self); };
                sync();
                setTimeout(sync, 10);
                setTimeout(sync, 100);

                // Implement standard computeSize override
                this.onComputeSize = function() {
                    var h = 34; // Header
                    var currentY = 30;
                    var custom = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude", "favorites_only"];
                    if (this.widgets) {
                        this.widgets.forEach(function(w) {
                            const isHidden = w.type === "hidden" || w.hidden || custom.indexOf(w.name) !== -1;
                            if (!isHidden) {
                                var wh = 24;
                                if (w.computeSize) wh = w.computeSize()[1];
                                w.y = currentY;
                                currentY += wh + 4;
                                h = currentY;
                            } else {
                                // Put hidden widgets way off screen so they don't capture clicks
                                w.y = -100;
                                w.hidden = true;
                            }
                        });
                    }
                    return [this.size[0], h + 6];
                };



                const updateAll = function() {
                    updateCountDisplay();
                    updateCkptList(self);
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                };

                const updateCountDisplay = function() {
                    const mWidget = self.widgets.find(function(w) { return w.name === "total_matching_models"; });
                    if (mWidget && cyclerMetadata) {
                        const count = calculateMatches(self);
                        mWidget.value = String(count);
                        if (mWidget.inputEl) {
                            mWidget.inputEl.value = mWidget.value;
                        }
                    } 
                };

                const initialPoll = async function() {
                    console.log("[CheckpointCycler] polling initial metadata...");
                    const data = await fetchMetadata();
                    const mWidget = self.widgets.find(function(w) { return w.name === "total_matching_models"; });
                    if (mWidget && data && data.checkpoints && data.checkpoints.length > 0) {
                        console.log("[CheckpointCycler] database ready, updating display");
                        updateAll();
                    } else if (mWidget) {
                        mWidget.value = (data && data.checkpoints) ? "Scanning checkpoints..." : "Database connection failed";
                        console.log("[CheckpointCycler] Database not ready yet: ", mWidget.value);
                        setTimeout(initialPoll, 2000);
                    }
                };

                initialPoll();

                // Setup Two-Way Sync Callbacks
                const ckptW = this.widgets.find(w => w.name === "ckpt_name");
                const ciW = this.widgets.find(w => w.name === "current_index");
                const repeatsW = this.widgets.find(w => w.name === "repeats");

                if (ckptW) {
                    const oldCb = ckptW.callback;
                    ckptW.callback = function() {
                        if (oldCb) oldCb.apply(this, arguments);
                        syncFromCkpt(self);
                    };
                }
                if (ciW) {
                    const oldCb = ciW.callback;
                    ciW.callback = function() {
                        if (oldCb) oldCb.apply(this, arguments);
                        syncFromIndex(self);
                    };
                }
                if (repeatsW) {
                    const oldCb = repeatsW.callback;
                    repeatsW.callback = function() {
                        if (oldCb) oldCb.apply(this, arguments);
                        syncFromIndex(self);
                    };
                }

                this.addWidget("text", "total_matching_models", "Connecting to database...", function() {});
                const mw = this.widgets.find(function(w) { return w.name === "total_matching_models"; });
                if (mw && mw.inputEl) {
                    mw.inputEl.readOnly = true;
                    mw.inputEl.style.color = "#4a9eff";
                }

                // Added iteration display widget
                this.addWidget("text", "cycler_status", "Initializing...", function() {});
                const sw = this.widgets.find(function(w) { return w.name === "cycler_status"; });
                if (sw && sw.inputEl) {
                    sw.inputEl.readOnly = true;
                    sw.inputEl.style.color = "#10b981"; // Greenish for active status
                }
                
                const setupDOMWidget = function() {
                    console.log("[CheckpointCycler] setupDOMWidget...");
                    try {
                        const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                        const container = document.createElement("div");
                        container.className = "cc-dom-container";
                        container.addEventListener("wheel", function(e) { e.stopPropagation(); });
                        container.addEventListener("pointerdown", function(e) { if (e.pointerType !== "mouse" || e.button !== 1) e.stopPropagation(); });

                        const renderSections = function() {
                            container.innerHTML = "";

                            const createSwitchRow = (labelHtml, initialValue, onToggle) => {
                                const row = document.createElement("div");
                                row.className = "cc-toggle-row";
                                
                                const label = document.createElement("label");
                                label.className = "cc-toggle-label";
                                label.innerHTML = labelHtml;
                                
                                const sw = document.createElement("label");
                                sw.className = "cc-switch";
                                const cb = document.createElement("input");
                                cb.type = "checkbox";
                                cb.checked = initialValue;
                                cb.onchange = (e) => onToggle(e.target.checked);
                                
                                const slider = document.createElement("span");
                                slider.className = "cc-slider";
                                
                                sw.appendChild(cb);
                                sw.appendChild(slider);
                                row.appendChild(label);
                                row.appendChild(sw);
                                
                                label.onclick = (e) => {
                                    if (e.target !== cb) {
                                        cb.checked = !cb.checked;
                                        onToggle(cb.checked);
                                    }
                                };
                                return row;
                            };
                            
                            // Top Row: Favorites Toggle
                            const topCont = document.createElement("div");
                            topCont.style = "display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px;";
                            
                            const favW = self.widgets.find(w => w.name === "favorites_only");
                            topCont.appendChild(createSwitchRow("Favorites Only", !!(favW ? favW.value : false), (val) => {
                                if (favW) {
                                    favW.value = val;
                                    if (favW.callback) favW.callback(val);
                                }
                                updateAll();
                            }));

                            container.appendChild(topCont);

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
                                        updateAll();
                                        renderSections();
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
                            
                            // Dynamically update the widget height to match the content
                            requestAnimationFrame(function() {
                                var contentH = Math.min(400, Math.max(60, container.scrollHeight + 10));
                                domW.computeSize = function() { return [self.size[0], contentH]; };
                                syncNodeLayout(self);
                            });
                        };


                        renderSections();
                        const domW = self.addDOMWidget("cc_ui", "CC_UI", container, {
                            serialize: false,
                            getValue: function() { return ""; },
                            setValue: function(v) { renderSections(); }
                        });
                        domW.computeSize = function() { return [self.size[0], 220]; };

                        // Recalculate size NOW that we've added the DOM widget
                        syncNodeLayout(self);
                    } catch (err) {
                        console.error("[CheckpointCycler] setupDOMWidget error:", err);
                    }
                };

                this.widgets = this.widgets.filter(function(w) { return w.type !== "button" || (!w.name.startsWith("+ Edit") && w.name !== "reset_cycle"); });
                this.addWidget("button", "reset_cycle", "Restart Cycle", function() {
                    const ciw = self.widgets.find(function(w) { return w.name === "current_index"; });
                    if (ciw) {
                        ciw.value = 0;
                        if (ciw.callback) ciw.callback(0);
                    }
                });

                requestAnimationFrame(function() {
                    if (!self.widgets.find(function(w) { return w.name === "cc_ui"; })) {
                        setupDOMWidget();
                        app.graph.setDirtyCanvas(true, true);
                    }
                });
                return r;
            };
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                var self = this;
                var sync = function() { syncNodeLayout(self); };
                sync();
                setTimeout(sync, 100);
                
                requestAnimationFrame(function() {
                    const uiw = self.widgets.find(function(w) { return w.name === "cc_ui"; });
                    if (uiw && uiw.options && uiw.options.setValue) uiw.options.setValue("");
                });
            };;

                const onExecuted = nodeType.prototype.onExecuted;
                nodeType.prototype.onExecuted = function (message) {
                    if (onExecuted) onExecuted.apply(this, arguments);
                    const self = this;
                    
                    if (message.total_count) {
                        const mWidget = this.widgets.find(function(w) { return w.name === "total_matching_models"; });
                        if (mWidget) {
                            mWidget.value = String(message.total_count[0]);
                            if (mWidget.inputEl) mWidget.inputEl.value = mWidget.value;
                        }
                    }

                    if (message.last_selected_ckpt) {
                        const ckptWidget = this.widgets.find(function(w) { return w.name === "last_selected_ckpt"; });
                        if (ckptWidget) ckptWidget.value = message.last_selected_ckpt[0];
                    }

                    if (message.ckpt_name) {
                        const ckptW = this.widgets.find(w => w.name === "ckpt_name");
                        if (ckptW && ckptW.value !== message.ckpt_name[0]) {
                            this._syncing = true;
                            ckptW.value = message.ckpt_name[0];
                            this._syncing = false;
                        }
                    }
                };
        }
    },

    setup() {
        // 1. Hook into Queue Prompt to provide "instant" cycling like seeds
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function(number, batch_count) {
            const count = Math.max(1, parseInt(batch_count) || 1);
            
            // Check readiness if any cyclers are active
            const cyclerNodes = app.graph.findNodesByType("Checkpoint Cycler");
            if (cyclerNodes.length > 0 && (!cyclerMetadata || !cyclerMetadata.checkpoints || cyclerMetadata.checkpoints.length === 0)) {
                alert("Checkpoint Cycler: Database not ready. Please wait for the scanner to finish.");
                return;
            }

            console.log("[CheckpointCycler] queuePrompt intercepted, total executions:", count);
            
            let lastResult;
            for (let i = 0; i < count; i++) {
                // 1. Capture snapshots of all nodes BEFORE this prompt is queued
                // This prevents double-counting if ComfyUI's native logic also triggers an increment.
                const snapshots = cyclerNodes.map(node => {
                    const ciw = node.widgets.find(w => w.name === "current_index");
                    const repeatsW = node.widgets.find(w => w.name === "repeats");
                    const controlW = node.widgets.find(w => w.name === "current_index_control") || 
                                     node.widgets.find(w => w.name === "control_after_generate");
                    
                    let mode = "increment";
                    if (controlW && controlW.value) {
                        const v = String(controlW.value).toLowerCase();
                        if (v === "randomize" || v === "random") mode = "randomize";
                        else if (v === "decrement") mode = "decrement";
                        else if (v === "fixed") mode = "fixed";
                        else if (v === "increment") mode = "increment";
                    }

                    console.log(`[CheckpointCycler] Node snapshot: val=${ciw.value}, mode=${mode}, repeats=${repeatsW ? repeatsW.value : 1}`);

                    return {
                        node,
                        ciw,
                        startVal: ciw ? parseInt(ciw.value) || 0 : 0,
                        repeats: repeatsW ? parseInt(repeatsW.value) || 1 : 1,
                        mode
                    };
                });

                // 2. Call original to queue THIS prompt with CURRENT widget values
                lastResult = await originalQueuePrompt.call(this, number, 1);

                // 3. Increment for the NEXT execution
                for (const snap of snapshots) {
                    const { node, ciw, startVal, repeats, mode } = snap;
                    if (!ciw) continue;

                    const matches = getFilteredCheckpoints(node);
                    const totalSteps = matches.length * repeats;
                    let newVal = startVal;

                    if (mode === "increment") {
                        newVal = startVal + 1;
                    } else if (mode === "decrement") {
                        newVal = startVal - 1;
                    } else if (mode === "randomize") {
                        // Smart Randomize: Only pick a new model if the current repeat cycle is finished
                        const iteration = (startVal % repeats) + 1;
                        if (iteration >= repeats) {
                            // Cycle finished, pick new random model start
                            newVal = Math.floor(Math.random() * Math.max(1, matches.length)) * repeats;
                            console.log(`[CheckpointCycler] Randomizing: new model index ${newVal / repeats}`);
                        } else {
                            // Still repeating current model
                            newVal = startVal + 1;
                            console.log(`[CheckpointCycler] Randomize iteration: ${iteration + 1}/${repeats}`);
                        }
                    }
                    
                    // Wrap around for increment/decrement if we have steps
                    if (totalSteps > 0 && (mode === "increment" || mode === "decrement")) {
                        newVal = newVal % totalSteps;
                        if (newVal < 0) newVal += totalSteps;
                    }

                    if (mode !== "fixed") {
                        console.log(`[CheckpointCycler] Updating index: ${startVal} -> ${newVal}`);
                        if (ciw.value !== newVal) {
                            ciw.value = newVal;
                        }
                        // Always trigger to ensure UI consistency
                        if (ciw.callback) ciw.callback(newVal);
                    }
                }
            }
            
            return lastResult;
        };
    }
});
