import { app } from "../../scripts/app.js";

/**
 * Static Random Int Node Extension
 * Adds a "Randomize" button to the node that updates the value widget
 * with a random integer between min_val and max_val.
 */

app.registerExtension({
    name: "comfyui-ckpt-utils.StaticRandomInt",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Static Random Int") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Add the randomize button
                this.addWidget("button", "🎲 Randomize", "randomize", () => {
                    const valueWidget = this.widgets.find(w => w.name === "value");
                    
                    if (valueWidget) {
                        const max = 1125899906842624;
                        const newVal = Math.floor(Math.random() * (max + 1));
                        
                        valueWidget.value = newVal;
                        
                        // Trigger widget callback if it exists to ensure the graph knows it changed
                        if (valueWidget.callback) {
                            valueWidget.callback(newVal);
                        }
                        
                        // Mark node as dirty to ensure it updates visually
                        this.setDirtyCanvas(true, true);
                    }
                });
                
                // Optionally, we can make the 'value' widget a bit more prominent or readonly 
                // if the user wants it to be *strictly* static. 
                // But keeping it editable allows manual overrides which is usually preferred.
                
                return r;
            };
        }
    }
});
