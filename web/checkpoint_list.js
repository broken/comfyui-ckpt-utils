import { app } from "../../scripts/app.js";

/**
 * Checkpoint List Node Extension
 * Provides a dynamic UI for managing a custom list of checkpoints.
 * Each list item has a premium, searchable custom dropdown menu to choose from scanned checkpoints.
 * Includes index cyclical control syncing on generation.
 */

const styles = `
    .cl-container {
        overflow-y: scroll;
        height: 100%;
        min-height: 150px;
        box-sizing: border-box;
    }
    .cl-container::-webkit-scrollbar {
        width: 8px;
    }
    .cl-container::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
    }
    .cl-container::-webkit-scrollbar-thumb {
        background: #5e81ac;
        border-radius: 10px;
    }
    .cl-container::-webkit-scrollbar-thumb:hover {
        background: #81a1c1;
    }
    .cl-item {
        background: rgba(45, 50, 60, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 12px;
        position: relative;
        margin-bottom: 10px;
        transition: transform 0.2s, background 0.2s;
    }
    .cl-item:hover {
        background: rgba(55, 60, 75, 0.8);
        border-color: rgba(66, 153, 225, 0.4);
    }
    .cl-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        color: #88c0d0;
    }
    .cl-remove-btn {
        background: rgba(191, 97, 106, 0.15);
        color: #bf616a;
        border: 1px solid rgba(191, 97, 106, 0.3);
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        font-size: 10px;
    }
    .cl-remove-btn:hover { background: #bf616a; color: #fff; }
    .cl-add-btn {
        background: linear-gradient(135deg, #5e81ac 0%, #81a1c1 100%);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
        width: 100%;
        box-sizing: border-box;
        text-align: center;
    }
    .cl-add-btn:hover {
        background: linear-gradient(135deg, #81a1c1 0%, #88c0d0 100%);
        transform: translateY(-1px);
    }
    .cl-add-btn:active {
        transform: translateY(0);
    }
    .cl-dropdown-container {
        position: relative;
        width: 100%;
    }
    .cl-dropdown-trigger {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #eceff4;
        font-size: 12px;
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        user-select: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
    }
    .cl-dropdown-trigger:hover {
        border-color: #88c0d0;
    }
    .cl-dropdown-arrow {
        font-size: 8px;
        opacity: 0.6;
        transition: transform 0.2s;
    }
    .cl-dropdown-container.open .cl-dropdown-arrow {
        transform: rotate(180deg);
    }
    .cl-dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #2e3440;
        border: 1px solid #4c566a;
        border-radius: 6px;
        margin-top: 4px;
        z-index: 1000;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        max-height: 250px;
        box-sizing: border-box;
    }
    .cl-dropdown-menu-hidden {
        display: none !important;
    }
    .cl-dropdown-search {
        background: rgba(0, 0, 0, 0.2);
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: #eceff4;
        padding: 8px 12px;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
        width: 100%;
    }
    .cl-dropdown-items {
        overflow-y: auto;
        flex: 1;
        max-height: 200px;
    }
    .cl-dropdown-item {
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
        color: #d8dee9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background 0.15s, color 0.15s;
    }
    .cl-dropdown-item:hover {
        background: #434c5e;
        color: #eceff4;
    }
    .cl-dropdown-item.selected {
        background: #88c0d0;
        color: #2e3440;
        font-weight: bold;
    }
`;

function injectStyles() {
    if (!document.getElementById("cl-node-styles")) {
        const style = document.createElement("style");
        style.id = "cl-node-styles";
        style.textContent = styles;
        document.head.appendChild(style);
    }
}

let cyclerMetadata = null;
let fetchOngoing = null;

async function fetchMetadata(force = false) {
    if (!force && cyclerMetadata && cyclerMetadata.checkpoints && cyclerMetadata.checkpoints.length > 0) {
        return cyclerMetadata;
    }
    if (fetchOngoing) return await fetchOngoing;
    
    fetchOngoing = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            console.log("[CheckpointList] Fetching metadata from server...");
            const url = "/comfyui-ckpt-utils/cycler-metadata" + (force ? "?refresh=true" : "");
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) {
                console.warn("[CheckpointList] Metadata fetch failed with status:", response.status);
                return { base_models: [], tags: [], checkpoints: [] };
            }
            const json = await response.json();
            if (!json.error) cyclerMetadata = json;
            else console.warn("[CheckpointList] Metadata JSON error:", json.error);
        } catch (e) {
            console.error("[CheckpointList] Failed to fetch cycler metadata:", e.message);
        }
        fetchOngoing = null;
        return cyclerMetadata || { base_models: [], tags: [], checkpoints: [] };
    })();
    return await fetchOngoing;
}

// Global click listener to close dropdowns when clicking outside
document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".cl-dropdown-container")) {
        document.querySelectorAll(".cl-dropdown-menu").forEach(menu => {
            menu.classList.add("cl-dropdown-menu-hidden");
        });
        document.querySelectorAll(".cl-dropdown-container").forEach(c => {
            c.classList.remove("open");
        });
    }
});

app.registerExtension({
    name: "comfyui-ckpt-utils.CheckpointList",

    getCustomWidgets() {
        return {
            CL_DATA(node, inputName, inputData) {
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
        if (nodeData.name === "Checkpoint List") {
            injectStyles();

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const self = this;

                // UI Container
                const container = document.createElement("div");
                container.className = "cl-container";
                
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
                    const ckptDataWidget = self.widgets.find(w => w.name === "ckpt_data");
                    if (!ckptDataWidget) return;

                    const items = [];
                    container.querySelectorAll(".cl-item").forEach(itemEl => {
                        items.push(itemEl.getAttribute("data-selected-ckpt") || "");
                    });
                    ckptDataWidget.value = JSON.stringify(items);
                };

                const renderItems = () => {
                    const ckptDataWidget = self.widgets.find(w => w.name === "ckpt_data");
                    if (!ckptDataWidget) return;

                    const scrollTop = container.scrollTop;
                    container.innerHTML = "";
                    let items = [];
                    try { items = JSON.parse(ckptDataWidget.value || "[]"); } catch (e) { items = []; }

                    items.forEach((checkpointName, idx) => {
                        const itemEl = document.createElement("div");
                        itemEl.className = "cl-item";
                        itemEl.setAttribute("data-selected-ckpt", checkpointName || "");
                        itemEl.innerHTML = `
                            <div class="cl-item-header">
                                <span>Checkpoint #${idx}</span>
                                <button class="cl-remove-btn">Remove</button>
                            </div>
                            <div class="cl-dropdown-container">
                                <div class="cl-dropdown-trigger">
                                    <span class="cl-dropdown-selected-value">${checkpointName || "Select Checkpoint..."}</span>
                                    <span class="cl-dropdown-arrow">▼</span>
                                </div>
                                <div class="cl-dropdown-menu cl-dropdown-menu-hidden">
                                    <input type="text" class="cl-dropdown-search" placeholder="Search checkpoints...">
                                    <div class="cl-dropdown-items"></div>
                                </div>
                            </div>
                        `;

                        const triggerEl = itemEl.querySelector(".cl-dropdown-trigger");
                        const menuEl = itemEl.querySelector(".cl-dropdown-menu");
                        const searchInput = itemEl.querySelector(".cl-dropdown-search");
                        const dropdownContainer = itemEl.querySelector(".cl-dropdown-container");

                        const renderDropdownItems = (filterText) => {
                            const itemsCont = menuEl.querySelector(".cl-dropdown-items");
                            itemsCont.innerHTML = "";
                            
                            let allCheckpoints = [];
                            if (cyclerMetadata && cyclerMetadata.checkpoints) {
                                allCheckpoints = cyclerMetadata.checkpoints.map(c => c.name).sort((a, b) => {
                                    const nameA = a.toLowerCase();
                                    const nameB = b.toLowerCase();
                                    if (nameA < nameB) return -1;
                                    if (nameA > nameB) return 1;
                                    return 0;
                                });
                            }
                            
                            const lowerFilter = filterText.toLowerCase();
                            const filtered = allCheckpoints.filter(name => !lowerFilter || name.toLowerCase().includes(lowerFilter));
                            
                            if (filtered.length === 0) {
                                const noMatch = document.createElement("div");
                                noMatch.className = "cl-dropdown-item";
                                noMatch.style.opacity = "0.5";
                                noMatch.style.cursor = "default";
                                noMatch.textContent = "No matching checkpoints";
                                itemsCont.appendChild(noMatch);
                                return;
                            }
                            
                            const currentVal = itemEl.getAttribute("data-selected-ckpt") || "";
                            
                            filtered.forEach(name => {
                                const div = document.createElement("div");
                                div.className = "cl-dropdown-item";
                                if (name === currentVal) {
                                    div.classList.add("selected");
                                }
                                div.textContent = name;
                                div.title = name;
                                div.onclick = (e) => {
                                    e.stopPropagation();
                                    itemEl.setAttribute("data-selected-ckpt", name);
                                    triggerEl.querySelector(".cl-dropdown-selected-value").textContent = name;
                                    menuEl.classList.add("cl-dropdown-menu-hidden");
                                    dropdownContainer.classList.remove("open");
                                    updateData();
                                };
                                itemsCont.appendChild(div);
                            });
                        };

                        triggerEl.onclick = (e) => {
                            e.stopPropagation();
                            
                            // Close all other dropdowns
                            container.querySelectorAll(".cl-dropdown-menu").forEach(m => {
                                if (m !== menuEl) {
                                    m.classList.add("cl-dropdown-menu-hidden");
                                    m.closest(".cl-dropdown-container").classList.remove("open");
                                }
                            });

                            const isClosed = menuEl.classList.contains("cl-dropdown-menu-hidden");
                            menuEl.classList.toggle("cl-dropdown-menu-hidden", !isClosed);
                            dropdownContainer.classList.toggle("open", isClosed);

                            if (isClosed) {
                                searchInput.value = "";
                                searchInput.focus();
                                renderDropdownItems("");
                            }
                        };

                        // Prevent pointer/mouse down events on search/dropdown items from reaching canvas
                        menuEl.onmousedown = (e) => e.stopPropagation();
                        menuEl.onpointerdown = (e) => e.stopPropagation();
                        menuEl.onclick = (e) => e.stopPropagation();

                        searchInput.oninput = (e) => {
                            renderDropdownItems(e.target.value);
                        };

                        itemEl.querySelector(".cl-remove-btn").onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            itemEl.remove();
                            updateData();
                            renderItems();
                        };

                        container.appendChild(itemEl);
                    });

                    const addBtn = document.createElement("button");
                    addBtn.className = "cl-add-btn";
                    addBtn.textContent = "+ Add Checkpoint";
                    addBtn.onclick = (e) => {
                        e.preventDefault();
                        const current = JSON.parse(ckptDataWidget.value || "[]");
                        current.push("");
                        ckptDataWidget.value = JSON.stringify(current);
                        renderItems();
                    };
                    container.appendChild(addBtn);
                    container.scrollTop = scrollTop;

                    requestAnimationFrame(() => {
                        const contentH = Math.min(800, Math.max(200, container.scrollHeight + 50));
                        if (uiW) {
                            uiW.computeSize = () => [self.size[0], contentH];
                            if (!self.size || self.size[1] < contentH) {
                                if (self.setSize) self.setSize([self.size[0], Math.max(self.size[1] || 0, contentH)]);
                            }
                        }
                    });
                };

                const uiW = this.addDOMWidget("cl_ui", "CL_UI", container, {
                    serialize: false,
                    getValue() { return ""; },
                    setValue(v) { renderItems(); }
                });

                const initialPoll = async function() {
                    const data = await fetchMetadata();
                    if (data && data.checkpoints && data.checkpoints.length > 0) {
                        renderItems();
                    } else {
                        setTimeout(initialPoll, 2000);
                    }
                };

                initialPoll();
                renderItems();

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                const ui = this.widgets.find(w => w.name === "cl_ui");
                if (ui && ui.options && ui.options.setValue) ui.options.setValue("");
            };
        }
    },

    setup() {
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function(number, batch_count) {
            const count = Math.max(1, parseInt(batch_count) || 1);
            const clNodes = app.graph.findNodesByType("Checkpoint List");

            for (let i = 0; i < count; i++) {
                const snapshots = clNodes.map(node => {
                    const indexW = node.widgets.find(w => w.name === "index");
                    const controlW = node.widgets.find(w => w.name === "control_after_generate");
                    const ckptDataW = node.widgets.find(w => w.name === "ckpt_data");
                    
                    let itemCount = 0;
                    try { itemCount = JSON.parse(ckptDataW.value || "[]").length; } catch(e) {}

                    return {
                        node,
                        indexW,
                        startVal: indexW ? parseInt(indexW.value) || 0 : 0,
                        mode: controlW ? controlW.value : "increment",
                        itemCount
                    };
                });

                const result = await originalQueuePrompt.call(this, number, 1);
                if (i === count - 1) var lastResult = result;

                for (const snap of snapshots) {
                    const { node, indexW, startVal, mode, itemCount } = snap;
                    if (!indexW || itemCount === 0) continue;

                    let normalizedMode = "increment";
                    if (mode) {
                        const v = String(mode).toLowerCase();
                        if (v === "randomize" || v === "random") normalizedMode = "randomize";
                        else if (v === "decrement") normalizedMode = "decrement";
                        else if (v === "fixed") normalizedMode = "fixed";
                        else if (v === "increment") normalizedMode = "increment";
                    }

                    console.log(`[CheckpointList] Node snapshot: val=${startVal}, mode=${normalizedMode}, itemCount=${itemCount}`);

                    if (normalizedMode === "fixed") continue;

                    let newVal = startVal;
                    if (normalizedMode === "increment") newVal = startVal + 1;
                    else if (normalizedMode === "decrement") newVal = startVal - 1;
                    else if (normalizedMode === "randomize") {
                        newVal = Math.floor(Math.random() * itemCount);
                        console.log(`[CheckpointList] Randomizing: new index ${newVal}`);
                    }

                    if (normalizedMode === "increment" || normalizedMode === "decrement") {
                        newVal = newVal % itemCount;
                        if (newVal < 0) newVal += itemCount;
                    }

                    console.log(`[CheckpointList] Updating index: ${startVal} -> ${newVal}`);
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
