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
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(0, 0, 0, 0.6); display: flex;
    align-items: center; justify-content: center; backdrop-filter: blur(2px);
}
.lm-modal {
    background: var(--comfy-menu-bg, #1a1a1a); border: 1px solid var(--border-color, #444);
    border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    width: 400px; max-width: 90%; max-height: 70vh; display: flex; flex-direction: column;
    font-family: sans-serif;
}
.lm-modal-header {
    display: flex; align-items: center; justify-content: space-between; padding: 16px;
    border-bottom: 1px solid var(--border-color, #444);
}
.lm-modal-title { font-size: 16px; font-weight: 600; color: var(--fg-color, #fff); margin: 0; }
.lm-modal-close {
    background: transparent; border: none; color: var(--fg-color, #fff); font-size: 22px;
    cursor: pointer; opacity: 0.7;
}
.lm-modal-close:hover { opacity: 1; }
.lm-modal-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.lm-checkbox-item {
    display: flex; align-items: center; gap: 10px; padding: 8px;
    border-radius: 4px; cursor: pointer; color: var(--fg-color, #fff); font-size: 13px;
}
.lm-checkbox-item:hover { background: var(--comfy-input-bg, #333); }
.lm-checkbox-item input { margin: 0; width: 16px; height: 16px; cursor: pointer; }
.lm-checkbox-count { opacity: 0.6; font-size: 11px; margin-left: auto; }
.lm-modal-search { width: 100%; padding: 8px; background: var(--comfy-input-bg, #333); border: 1px solid var(--border-color, #444); border-radius: 4px; color: var(--fg-color, #fff); margin-bottom: 12px; box-sizing: border-box; }
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
                
                const setupMultiCombos = () => {
                    if (!this.widgets) return;
                    const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                    
                    let addedButtons = false;
                    this.widgets.forEach(w => {
                        if (multiCombos.includes(w.name) && w.type !== "hidden") {
                            w.type = "hidden"; // We don't want the default string input box drawn
                            w.computeSize = () => [0, 0];
                            w.hidden = true; // Tell LiteGraph to hide it from interactions
                            if (w.inputEl) {
                                w.inputEl.style.display = "none";
                            }
                            
                            let title = w.name.replace("_", " ").toUpperCase();
                            this.addWidget("button", "+ Edit " + title, "Edit", () => {
                                const counts = getAvailableCounts(this, w.name);
                                const allNames = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                                
                                const items = allNames.map(n => ({name: n, count: counts[n]}));
                                const selected = (w.value || "").split(",").map(x => x.trim()).filter(x => x);
                                
                                openModal("Select " + title, items, selected, (newSelection) => {
                                    w.value = newSelection.join(", ");
                                    updateCountDisplay();
                                    app.graph.setDirtyCanvas(true, true);
                                });
                            });
                            addedButtons = true;
                        }
                    });
                    
                    if (addedButtons) {
                        this.setSize(this.computeSize());
                        app.graph.setDirtyCanvas(true, true);
                    }
                };

                setTimeout(setupMultiCombos, 10);

                // Custom drawing for chips
                const onDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function(ctx) {
                    if (onDrawForeground) onDrawForeground.apply(this, arguments);
                    
                    if (!cyclerMetadata) return;
                    
                    for (let w of this.widgets) {
                        if (w.type === "button" && w.name.startsWith("+ Edit")) {
                            const relatedName = w.name.replace("+ Edit ", "").toLowerCase().replace(" ", "_");
                            const hiddenW = this.widgets.find(x => x.name === relatedName);
                            
                            if (hiddenW && hiddenW.value) {
                                const selected = hiddenW.value.split(",").map(x => x.trim()).filter(x => x);
                                if (selected.length > 0) {
                                    const counts = getAvailableCounts(this, relatedName);
                                    
                                    ctx.save();
                                    ctx.font = "11px sans-serif";
                                    let xPos = 15;
                                    let yPos = w.last_y + 30; // Below button
                                    
                                    let isExclude = relatedName.includes("exclude");
                                    let isBase = relatedName === "base_models";
                                    
                                    ctx.fillStyle = isBase ? "rgba(150, 150, 150, 0.4)" : (isExclude ? "rgba(239, 68, 68, 0.15)" : "rgba(66, 153, 225, 0.15)");
                                    ctx.strokeStyle = isBase ? "rgba(200, 200, 200, 0.5)" : (isExclude ? "rgba(239, 68, 68, 0.4)" : "rgba(66, 153, 225, 0.4)");
                                    let textColor = isBase ? "#ffffff" : (isExclude ? "#ef4444" : "#4299e1");
                                    
                                    selected.forEach(sel => {
                                        let txt = \`\${sel} (\${counts[sel]||0})\`;
                                        let tw = ctx.measureText(txt).width;
                                        
                                        if (xPos + tw + 16 > this.size[0] - 15) {
                                            xPos = 15;
                                            yPos += 24;
                                        }
                                        
                                        ctx.beginPath();
                                        ctx.roundRect(xPos, yPos - 12, tw + 12, 20, 4);
                                        ctx.fill();
                                        ctx.stroke();
                                        
                                        ctx.fillStyle = textColor;
                                        ctx.fillText(txt, xPos + 6, yPos + 2);
                                        
                                        // restore colors after drawing text
                                        ctx.fillStyle = isBase ? "rgba(150, 150, 150, 0.4)" : (isExclude ? "rgba(239, 68, 68, 0.15)" : "rgba(66, 153, 225, 0.15)");
                                        
                                        xPos += tw + 18;
                                    });
                                    ctx.restore();
                                    
                                    // Make some space below the button for these chips so they don't overlap the next widget
                                    if (!w.originalComputeSize) {
                                        w.originalComputeSize = w.computeSize;
                                    }
                                    w.computeSize = function() {
                                        let base = w.originalComputeSize ? w.originalComputeSize.call(w) : [0, 28];
                                        return [base[0], Math.max(28, yPos - w.last_y + 16)];
                                    };
                                } else {
                                    if (w.originalComputeSize) {
                                        w.computeSize = w.originalComputeSize;
                                    }
                                }
                            }
                        }
                    }
                };

                this.addWidget("button", "reset_cycle", "Restart Cycle (Set index to 0)", () => {
                    const currentIndexWidget = this.widgets.find((w) => w.name === "current_index");
                    if (currentIndexWidget) {
                        currentIndexWidget.value = 0;
                    }
                });

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                
                const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                let addedButtons = false;
                if (this.widgets) {
                    this.widgets.forEach(w => {
                        if (multiCombos.includes(w.name) && w.type !== "hidden") {
                            w.type = "hidden";
                            w.computeSize = () => [0, 0];
                            w.hidden = true;
                            if (w.inputEl) {
                                w.inputEl.style.display = "none";
                            }
                            
                            let title = w.name.replace("_", " ").toUpperCase();
                            this.addWidget("button", "+ Edit " + title, "Edit", () => {
                                const counts = getAvailableCounts(this, w.name);
                                const allNames = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                                
                                const items = allNames.map(n => ({name: n, count: counts[n]}));
                                const selected = (w.value || "").split(",").map(x => x.trim()).filter(x => x);
                                
                                openModal("Select " + title, items, selected, (newSelection) => {
                                    w.value = newSelection.join(", ");
                                    // Hack to force UI update if needed
                                    app.graph.setDirtyCanvas(true, true);
                                });
                            });
                            addedButtons = true;
                        }
                    });
                    if (addedButtons) {
                        this.setSize(this.computeSize());
                        app.graph.setDirtyCanvas(true, true);
                    }
                }
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
