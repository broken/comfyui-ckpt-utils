import { app } from "../../scripts/app.js";

/**
 * Prompt Selection Node Extension
 * Provides a dynamic UI for managing multiple positive/negative prompt pairs.
 * Includes seed-style index controls and instant selection syncing.
 */

const styles = `
        overflow-y: scroll;
        height: 100%;
        min-height: 150px;
        box-sizing: border-box;
    }
    .ps-container::-webkit-scrollbar {
        width: 8px;
    }
    .ps-container::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
    }
    .ps-container::-webkit-scrollbar-thumb {
        background: #5e81ac;
        border-radius: 10px;
    }
    .ps-container::-webkit-scrollbar-thumb:hover {
        background: #81a1c1;
    }
    .ps-container textarea:focus {
        border-color: #88c0d0;
        box-shadow: 0 0 0 2px rgba(136, 192, 208, 0.2);
    }
    .ps-add-btn:hover {
        background: linear-gradient(135deg, #81a1c1 0%, #88c0d0 100%);
        transform: translateY(-1px);
    }
    .ps-add-btn:active {
        transform: translateY(0);
    }
    .ps-pair {
        background: rgba(45, 50, 60, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 12px;
        position: relative;
        transition: transform 0.2s, background 0.2s;
    }
    .ps-pair:hover {
        background: rgba(55, 60, 75, 0.8);
        border-color: rgba(66, 153, 225, 0.4);
    }
    .ps-pair-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        color: #88c0d0;
    }
    .ps-remove-btn {
        background: rgba(191, 97, 106, 0.15);
        color: #bf616a;
        border: 1px solid rgba(191, 97, 106, 0.3);
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        font-size: 10px;
    }
    .ps-remove-btn:hover { background: #bf616a; color: #fff; }
    .ps-textarea {
        width: 100%;
        min-height: 45px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #eceff4;
        font-size: 12px;
        padding: 8px;
        margin-bottom: 8px;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
    }
    .ps-textarea.ps-neg { border-left: 3px solid #bf616a; }
    .ps-textarea.ps-pos { border-left: 3px solid #a3be8c; }
    .ps-add-btn {
        background: linear-gradient(135deg, #5e81ac 0%, #81a1c1 100%);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
    }
`;

function injectStyles() {
    if (!document.getElementById("ps-node-styles")) {
        const style = document.createElement("style");
        style.id = "ps-node-styles";
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

// Helper to sync selection widgets from the current index
function syncSelection(node) {
    const promptDataW = node.widgets.find(w => w.name === "prompt_data");
    const indexW = node.widgets.find(w => w.name === "index");
    const posW = node.widgets.find(w => w.name === "selected_positive");
    const negW = node.widgets.find(w => w.name === "selected_negative");

    if (!promptDataW || !indexW) return;

    let pairs = [];
    try { pairs = JSON.parse(promptDataW.value || "[]"); } catch (e) { pairs = []; }

    if (pairs.length > 0) {
        const idx = parseInt(indexW.value) || 0;
        const actualIdx = Math.max(0, Math.min(idx, pairs.length - 1));
        const pair = pairs[actualIdx];
        
        if (posW) {
            posW.value = pair.pos || "";
            if (posW.inputEl) posW.inputEl.value = posW.value;
        }
        if (negW) {
            negW.value = pair.neg || "";
            if (negW.inputEl) negW.inputEl.value = negW.value;
        }
    } else {
        if (posW) posW.value = "";
        if (negW) negW.value = "";
    }
}

app.registerExtension({
    name: "comfyui-ckpt-utils.PromptSelection",

    getCustomWidgets() {
        return {
            PS_DATA(node, inputName, inputData) {
                const w = {
                    type: "hidden",
                    name: inputName,
                    value: inputData[1] && inputData[1].default ? inputData[1].default : "[]",
                    options: { serialize: true },
                    draw: () => {},
                    computeSize: () => [0, 0]
                };
                if (!node.widgets) node.widgets = [];
                node.widgets.push(w);
                return { widget: w };
            }
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Prompt Selection") {
            injectStyles();

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                // Index callback for syncing
                const indexWidget = this.widgets.find(w => w.name === "index");
                if (indexWidget) {
                    const oldCb = indexWidget.callback;
                    indexWidget.callback = function() {
                        if (oldCb) oldCb.apply(this, arguments);
                        syncSelection(self);
                    };
                }

                // Make selection outputs read-only
                const posWidget = this.widgets.find(w => w.name === "selected_positive");
                const negWidget = this.widgets.find(w => w.name === "selected_negative");
                
                [posWidget, negWidget].forEach(w => {
                    if (w) {
                        w.disabled = true;
                        if (w.inputEl) {
                            w.inputEl.readOnly = true;
                            w.inputEl.style.opacity = "0.7";
                        }
                    }
                });

                // UI Container
                const container = document.createElement("div");
                container.className = "ps-container";
                
                // Stop events from reaching ComfyUI canvas
                container.addEventListener("wheel", (e) => {
                    e.stopPropagation();
                }, { passive: false });
                
                container.addEventListener("pointerdown", (e) => {
                    e.stopPropagation();
                });

                container.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                });

                const updateData = () => {
                    const promptDataWidget = self.widgets.find(w => w.name === "prompt_data");
                    if (!promptDataWidget) return;

                    const pairs = [];
                    container.querySelectorAll(".ps-pair").forEach(pairEl => {
                        const pos = pairEl.querySelector(".ps-pos").value;
                        const neg = pairEl.querySelector(".ps-neg").value;
                        pairs.push({ pos, neg });
                    });
                    promptDataWidget.value = JSON.stringify(pairs);
                    syncSelection(self); 
                };

                const renderPairs = () => {
                    const promptDataWidget = self.widgets.find(w => w.name === "prompt_data");
                    if (!promptDataWidget) return;

                    const scrollTop = container.scrollTop;
                    container.innerHTML = "";
                    let pairs = [];
                    try { pairs = JSON.parse(promptDataWidget.value || "[]"); } catch (e) { pairs = []; }

                    pairs.forEach((pair, idx) => {
                        const pairEl = document.createElement("div");
                        pairEl.className = "ps-pair";
                        pairEl.innerHTML = `
                            <div class="ps-pair-header">
                                <span>Pair #${idx}</span>
                                <button class="ps-remove-btn">Remove</button>
                            </div>
                            <textarea class="ps-textarea ps-pos" placeholder="Positive Prompt...">${pair.pos || ""}</textarea>
                            <textarea class="ps-textarea ps-neg" placeholder="Negative Prompt...">${pair.neg || ""}</textarea>
                        `;

                        pairEl.querySelector(".ps-remove-btn").onclick = (e) => {
                            e.preventDefault();
                            pairEl.remove();
                            updateData();
                            renderPairs();
                        };

                        pairEl.querySelectorAll("textarea").forEach(ta => {
                            ta.oninput = () => updateData();
                        });

                        container.appendChild(pairEl);
                    });

                    const addBtn = document.createElement("button");
                    addBtn.className = "ps-add-btn";
                    addBtn.textContent = "+ Add New Pair";
                    addBtn.onclick = (e) => {
                        e.preventDefault();
                        const current = JSON.parse(promptDataWidget.value || "[]");
                        current.push({ pos: "", neg: "" });
                        promptDataWidget.value = JSON.stringify(current);
                        renderPairs();
                    };
                    container.appendChild(addBtn);
                    container.scrollTop = scrollTop;

                    requestAnimationFrame(() => {
                        const contentH = Math.min(800, Math.max(200, container.scrollHeight + 50));
                        if (uiW) {
                            uiW.computeSize = () => [self.size[0], contentH];
                            // If we're small or just created, snap to content. 
                            // Otherwise, allow the user's manual resize to persist.
                            if (!self.size || self.size[1] < contentH) {
                                if (self.setSize) self.setSize([self.size[0], Math.max(self.size[1] || 0, contentH)]);
                            }
                        }
                    });
                };

                const uiW = this.addDOMWidget("ps_ui", "PS_UI", container, {
                    serialize: false,
                    getValue() { return ""; },
                    setValue(v) { renderPairs(); }
                });

                renderPairs();
                syncSelection(this);

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                const ui = this.widgets.find(w => w.name === "ps_ui");
                if (ui && ui.options && ui.options.setValue) ui.options.setValue("");
                syncSelection(this);
            };
        }
    },

    setup() {
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function(number, batch_count) {
            const count = Math.max(1, parseInt(batch_count) || 1);
            const promptNodes = app.graph.findNodesByType("Prompt Selection");

            for (let i = 0; i < count; i++) {
                const snapshots = promptNodes.map(node => {
                    const indexW = node.widgets.find(w => w.name === "index");
                    const controlW = node.widgets.find(w => w.name === "control_after_generate");
                    const promptDataW = node.widgets.find(w => w.name === "prompt_data");
                    
                    let pairCount = 0;
                    try { pairCount = JSON.parse(promptDataW.value || "[]").length; } catch(e) {}

                    syncSelection(node);

                    return {
                        node,
                        indexW,
                        startVal: indexW ? parseInt(indexW.value) || 0 : 0,
                        mode: controlW ? controlW.value : "increment",
                        pairCount
                    };
                });

                const result = await originalQueuePrompt.call(this, number, 1);
                if (i === count - 1) var lastResult = result;

                for (const snap of snapshots) {
                    const { node, indexW, startVal, mode, pairCount } = snap;
                    if (!indexW || pairCount === 0) continue;

                    let normalizedMode = "increment";
                    if (mode) {
                        const v = String(mode).toLowerCase();
                        if (v === "randomize" || v === "random") normalizedMode = "randomize";
                        else if (v === "decrement") normalizedMode = "decrement";
                        else if (v === "fixed") normalizedMode = "fixed";
                        else if (v === "increment") normalizedMode = "increment";
                    }

                    console.log(`[PromptSelection] Node snapshot: val=${startVal}, mode=${normalizedMode}, pairCount=${pairCount}`);

                    if (normalizedMode === "fixed") continue;

                    let newVal = startVal;
                    if (normalizedMode === "increment") newVal = startVal + 1;
                    else if (normalizedMode === "decrement") newVal = startVal - 1;
                    else if (normalizedMode === "randomize") {
                        newVal = Math.floor(Math.random() * pairCount);
                        console.log(`[PromptSelection] Randomizing: new index ${newVal}`);
                    }

                    if (normalizedMode === "increment" || normalizedMode === "decrement") {
                        newVal = newVal % pairCount;
                        if (newVal < 0) newVal += pairCount;
                    }

                    console.log(`[PromptSelection] Updating index: ${startVal} -> ${newVal}`);
                    if (indexW.value !== newVal) {
                        indexW.value = newVal;
                        if (indexW.callback) indexW.callback(newVal);
                    }
                }
            }
            return lastResult;
        };
    }
});
