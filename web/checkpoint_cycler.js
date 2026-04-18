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
                
                const setupMultiCombos = () => {
                    const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                    const widgetsToHide = this.widgets.filter(w => multiCombos.includes(w.name));
                    
                    if (widgetsToHide.length === 0) return;

                    widgetsToHide.forEach(w => {
                        // Ensure it stays completely hidden from layout calculations
                        w.computeSize = () => [0, 0];

                        // Add the button only if missing
                        const title = w.name.replace("_", " ").toUpperCase();
                        const btnName = "+ Edit " + title;
                        if (!this.widgets.find(bw => bw.name === btnName)) {
                            this.addWidget("button", btnName, "Edit", () => {
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
                        }
                    });

                    this.setSize(this.computeSize());
                };

                // Use requestAnimationFrame for safer initialization
                requestAnimationFrame(() => {
                    setupMultiCombos();
                    app.graph.setDirtyCanvas(true, true);
                });

                const onDrawForeground = this.onDrawForeground;
                this.onDrawForeground = function(ctx) {
                    if (onDrawForeground) onDrawForeground.apply(this, arguments);
                    if (!cyclerMetadata) return;
                    
                    // Interaction handling for chips (simple distance check)
                    const mouse = app.canvas.graph_mouse;
                    let hoveredChip = null;

                    for (let w of this.widgets) {
                        if (w.type === "button" && w.name.startsWith("+ Edit")) {
                            const relatedName = w.name.replace("+ Edit ", "").toLowerCase().replace(" ", "_");
                            const hiddenW = this.widgets.find(x => x.name === relatedName);
                            if (hiddenW && hiddenW.value) {
                                const selected = hiddenW.value.split(",").map(x => x.trim()).filter(x => x);
                                if (selected.length > 0) {
                                    const counts = getAvailableCounts(this, relatedName);
                                    ctx.save();
                                    let xPos = 15;
                                    let yPos = w.last_y + 30; 
                                    
                                    const isExclude = relatedName.includes("exclude");
                                    const isBase = relatedName === "base_models";
                                    
                                    // Premium Colors
                                    let charColor = "#fff";
                                    let bgColor = isBase ? "rgba(79, 70, 229, 0.4)" : (isExclude ? "rgba(225, 29, 72, 0.2)" : "rgba(16, 185, 129, 0.2)");
                                    let strokeColor = isBase ? "rgba(99, 102, 241, 0.8)" : (isExclude ? "rgba(244, 63, 94, 0.8)" : "rgba(52, 211, 153, 0.8)");
                                    let textColor = isBase ? "#e0e7ff" : (isExclude ? "#fecdd3" : "#d1fae5");

                                    selected.forEach(sel => {
                                        ctx.font = "11px Inter, sans-serif";
                                        let txt = `${sel} (${counts[sel]||0})`;
                                        let tw = ctx.measureText(txt).width;
                                        
                                        if (xPos + tw + 24 > this.size[0] - 15) {
                                            xPos = 15;
                                            yPos += 24;
                                        }

                                        // Chip rendering
                                        ctx.beginPath();
                                        ctx.roundRect(xPos, yPos - 12, tw + 20, 20, 6);
                                        ctx.fillStyle = bgColor;
                                        ctx.fill();
                                        ctx.lineWidth = 1;
                                        ctx.strokeStyle = strokeColor;
                                        ctx.stroke();

                                        ctx.fillStyle = textColor;
                                        ctx.fillText(txt, xPos + 8, yPos + 2);

                                        // Check for click/hover (approximate)
                                        if (mouse && mouse[0] >= xPos && mouse[0] <= xPos + tw + 20 && 
                                            mouse[1] >= yPos - 12 && mouse[1] <= yPos + 8) {
                                            hoveredChip = { widget: hiddenW, value: sel };
                                            ctx.strokeStyle = "#fff";
                                            ctx.stroke();
                                        }
                                        
                                        xPos += tw + 28;
                                    });
                                    ctx.restore();
                                    
                                    if (!w.originalComputeSize) w.originalComputeSize = w.computeSize;
                                    w.computeSize = () => {
                                        let base = w.originalComputeSize ? w.originalComputeSize.call(w) : [0, 28];
                                        return [base[0], Math.max(28, yPos - w.last_y + 16)];
                                    };
                                } else {
                                    if (w.originalComputeSize) w.computeSize = w.originalComputeSize;
                                }
                            }
                        }
                    }

                    // Store hovered info for click handler
                    this._hovered_chip = hoveredChip;
                };

                // Add click handler to node to remove chips
                const onMouseDown = this.onMouseDown;
                this.onMouseDown = function(e, local_pos) {
                    if (this._hovered_chip) {
                        const { widget, value } = this._hovered_chip;
                        let selected = widget.value.split(",").map(x => x.trim()).filter(x => x && x !== value);
                        widget.value = selected.join(", ");
                        updateCountDisplay();
                        app.graph.setDirtyCanvas(true, true);
                        return true; // handled
                    }
                    if (onMouseDown) return onMouseDown.apply(this, arguments);
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
                requestAnimationFrame(() => {
                    const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                    if (this.widgets) {
                        this.widgets.forEach(w => {
                            if (multiCombos.includes(w.name)) {
                                w.computeSize = () => [0, 0];
                            }
                        });
                        // buttons are already added by onNodeCreated if configured correctly, 
                        // but let's ensure they are there if not.
                        const multiCombosBtns = multiCombos.map(mc => "+ Edit " + mc.replace("_", " ").toUpperCase());
                        multiCombosBtns.forEach((btnName, idx) => {
                            if (!this.widgets.find(bw => bw.name === btnName)) {
                                const wName = multiCombos[idx];
                                this.addWidget("button", btnName, "Edit", () => {
                                    const counts = getAvailableCounts(this, wName);
                                    const allNames = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
                                    const items = allNames.map(n => ({name: n, count: counts[n]}));
                                    const selected = (this.widgets.find(x => x.name === wName).value || "").split(",").map(x => x.trim()).filter(x => x);
                                    openModal("Select " + btnName.replace("+ Edit ", ""), items, selected, (newSelection) => {
                                        const w = this.widgets.find(x => x.name === wName);
                                        w.value = newSelection.join(", ");
                                        app.graph.setDirtyCanvas(true, true);
                                    });
                                });
                            }
                        });
                        this.setSize(this.computeSize());
                        app.graph.setDirtyCanvas(true, true);
                    }
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
