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
                        mWidget.value = `Available cycle matches: ${calculateMatches(this)}`;
                    } 
                };

                const initialPoll = async () => {
                    await fetchMetadata();
                    const mWidget = this.widgets.find(w => w.name === "total_matching_models");
                    if (mWidget && cyclerMetadata && cyclerMetadata.checkpoints.length > 0) {
                        updateCountDisplay();
                        
                        // Dynamically update tags now that metadata is fetched
                        const ti = this.widgets.find(w => w.name === "tags_include");
                        const te = this.widgets.find(w => w.name === "tags_exclude");
                        if(ti && ti.options) ti.options.values = [""].concat(cyclerMetadata.tags.filter(t => t !== "[Clear]" && t !== "Any" && t !== ""));
                        if(te && te.options) te.options.values = [""].concat(cyclerMetadata.tags.filter(t => t !== "[Clear]" && t !== "Any" && t !== ""));
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

                const multiCombos = ["base_models", "tags_include", "tags_exclude", "folders_include", "folders_exclude"];
                this.widgets.forEach(w => {
                    if (multiCombos.includes(w.name)) {
                        const origCallback = w.callback;
                        w.callback = function(value) {
                            if (!value || value.trim() === "") {
                                w.value = ""; 
                            } else {
                                const current = w.value && w.value.trim() !== "" ? w.value.split(",").map(s=>s.trim()) : [];
                                if (!current.includes(value)) {
                                    current.push(value);
                                }
                                w.value = current.join(", ");
                            }
                            updateCountDisplay();
                            if (origCallback) origCallback.apply(this, arguments);
                            app.graph.setDirtyCanvas(true, true);
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
