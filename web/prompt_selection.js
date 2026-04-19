import { app } from "../../scripts/app.js";

/**
 * Prompt Selection Node Extension
 * Provides a dynamic UI for managing multiple positive/negative prompt pairs.
 */

// Premium styles for the Prompt Selection UI
const styles = `
    .ps-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: rgba(20, 20, 25, 0.85);
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #eee;
        overflow-y: auto;
        max-height: 500px;
        scrollbar-width: thin;
        scrollbar-color: #444 transparent;
    }
    .ps-container::-webkit-scrollbar { width: 6px; }
    .ps-container::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }
    
    .ps-pair {
        background: rgba(45, 50, 60, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 12px;
        position: relative;
        transition: transform 0.2s, background 0.2s;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
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
        letter-spacing: 0.1em;
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
        font-weight: bold;
        transition: all 0.2s;
    }
    .ps-remove-btn:hover {
        background: #bf616a;
        color: #fff;
    }
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
        transition: border-color 0.2s;
    }
    .ps-textarea:focus { border-color: #81a1c1; background: rgba(0,0,0,0.5); }
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
        letter-spacing: 0.05em;
        box-shadow: 0 4px 15px rgba(94, 129, 172, 0.3);
        transition: all 0.2s;
    }
    .ps-add-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(94, 129, 172, 0.4);
    }
    .ps-add-btn:active { transform: translateY(0); }
`;

function injectStyles() {
    if (!document.getElementById("ps-node-styles")) {
        const style = document.createElement("style");
        style.id = "ps-node-styles";
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

app.registerExtension({
    name: "comfyui-ckpt-utils.PromptSelection",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Prompt Selection") {
            injectStyles();

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                // 1. Find and hide internal widgets
                const promptDataWidget = this.widgets.find(w => w.name === "prompt_data");
                if (promptDataWidget) {
                    promptDataWidget.type = "hidden";
                    promptDataWidget.computeSize = () => [0, 0];
                }

                const posWidget = this.widgets.find(w => w.name === "selected_positive");
                const negWidget = this.widgets.find(w => w.name === "selected_negative");
                
                [posWidget, negWidget].forEach(w => {
                    if (w) {
                        w.disabled = true;
                        if (w.inputEl) {
                            w.inputEl.readOnly = true;
                            w.inputEl.style.opacity = "0.7";
                            w.inputEl.style.background = "rgba(0,0,0,0.2)";
                        }
                    }
                });

                // 2. Create the DOM container for dynamic pairs
                const container = document.createElement("div");
                container.className = "ps-container";
                // Prevent graph interactions while typing
                container.addEventListener("wheel", (e) => e.stopPropagation());
                container.addEventListener("pointerdown", (e) => e.stopPropagation());

                const updateData = () => {
                    const pairs = [];
                    container.querySelectorAll(".ps-pair").forEach(pairEl => {
                        const pos = pairEl.querySelector(".ps-pos").value;
                        const neg = pairEl.querySelector(".ps-neg").value;
                        pairs.push({ pos, neg });
                    });
                    promptDataWidget.value = JSON.stringify(pairs);
                };

                const renderPairs = () => {
                    // Save scroll position
                    const scrollTop = container.scrollTop;
                    container.innerHTML = "";
                    
                    let pairs = [];
                    try {
                        pairs = JSON.parse(promptDataWidget.value || "[]");
                    } catch (e) {
                        pairs = [];
                    }

                    pairs.forEach((pair, idx) => {
                        const pairEl = document.createElement("div");
                        pairEl.className = "ps-pair";
                        pairEl.innerHTML = `
                            <div class="ps-pair-header">
                                <span>Pair #${idx}</span>
                                <button class="ps-remove-btn" title="Remove this pair">Remove</button>
                            </div>
                            <textarea class="ps-textarea ps-pos" placeholder="Positive Prompt...">${pair.pos || ""}</textarea>
                            <textarea class="ps-textarea ps-neg" placeholder="Negative Prompt...">${pair.neg || ""}</textarea>
                        `;

                        pairEl.querySelector(".ps-remove-btn").onclick = (e) => {
                            e.preventDefault();
                            pairEl.style.opacity = "0";
                            pairEl.style.transform = "scale(0.9)";
                            setTimeout(() => {
                                pairEl.remove();
                                updateData();
                                renderPairs();
                            }, 150);
                        };

                        pairEl.querySelectorAll("textarea").forEach(ta => {
                            ta.oninput = () => {
                                updateData();
                            };
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
                        // Scroll to bottom
                        setTimeout(() => container.scrollTop = container.scrollHeight, 10);
                    };
                    container.appendChild(addBtn);

                    // Restore scroll
                    container.scrollTop = scrollTop;

                    // Automatically adjust node height
                    requestAnimationFrame(() => {
                        const contentH = Math.min(600, Math.max(100, container.scrollHeight + 40));
                        if (uiW) {
                            uiW.computeSize = () => [self.size[0], contentH];
                            // Force resize using LiteGraph method if available
                            if (self.setSize) self.setSize([self.size[0], self.computeSize()[1]]);
                        }
                    });
                };

                // Add the special DOM widget
                const uiW = this.addDOMWidget("ps_ui", "PS_UI", container, {
                    serialize: false,
                    getValue() { return ""; },
                    setValue(v) { renderPairs(); }
                });

                renderPairs();

                // Override onExecuted to show choice
                const onExecuted = nodeType.prototype.onExecuted;
                this.onExecuted = function(message) {
                    if (onExecuted) onExecuted.apply(this, arguments);
                    if (message.selection_info) {
                        const { positive, negative } = message.selection_info;
                        if (posWidget) {
                            posWidget.value = positive;
                            if (posWidget.inputEl) posWidget.inputEl.value = positive;
                        }
                        if (negWidget) {
                            negWidget.value = negative;
                            if (negWidget.inputEl) negWidget.inputEl.value = negative;
                        }
                    }
                };

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                const ui = this.widgets.find(w => w.name === "ps_ui");
                if (ui && ui.options && ui.options.setValue) {
                    ui.options.setValue("");
                }
            };
        }
    }
});
