const iframe = document.getElementById('site-frame') as HTMLIFrameElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLElement;

let selectedId: string | null = null;

// Define the mapping between HTML Inputs and CSS Properties
const inputs = {
    width: document.getElementById('widthInput') as HTMLInputElement,
    height: document.getElementById('heightInput') as HTMLInputElement,
    padding: document.getElementById('paddingInput') as HTMLInputElement,
    margin: document.getElementById('marginInput') as HTMLInputElement,
    textAlign: document.getElementById('alignInput') as HTMLSelectElement,
    color: document.getElementById('colorInput') as HTMLInputElement,
    backgroundColor: document.getElementById('bgInput') as HTMLInputElement,
};

iframe.onload = () => {
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.body.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('[data-editor-id]') as HTMLElement;
        if (target) {
            const id = target.getAttribute('data-editor-id');
            if (id) {
                selectedId = id;
                drawSelectionBox(target);
                syncSidebar(target); // <--- NEW: Populate inputs
                startDrag(target, id, e);
            }
        }
    });
};

// ---- 1. Sync Sidebar with Selected Element ----
function syncSidebar(el: HTMLElement) {
    const style = window.getComputedStyle(el);
    
    // Text Inputs
    inputs.width.value = style.width;
    inputs.height.value = style.height;
    inputs.padding.value = style.padding;
    inputs.margin.value = style.margin;
    inputs.textAlign.value = style.textAlign;

    // Colors (Convert RGB to Hex for the input)
    inputs.color.value = rgbToHex(style.color);
    inputs.backgroundColor.value = rgbToHex(style.backgroundColor);
}

// ---- 2. Generic Input Listener ----
// This loops through all inputs and adds listeners automatically
const propMap: Record<string, string> = {
    width: 'width', height: 'height', padding: 'padding', margin: 'margin',
    textAlign: 'text-align', color: 'color', backgroundColor: 'background-color'
};

Object.keys(inputs).forEach(key => {
    const input = inputs[key as keyof typeof inputs];
    const cssProp = propMap[key];

    input.addEventListener('change', (e) => { // 'change' fires on Enter or Blur
        if (!selectedId) return;
        const val = (e.target as HTMLInputElement).value;
        updateElement(selectedId, cssProp, val);
    });
    
    // For sliders/colors, 'input' fires while dragging
    input.addEventListener('input', (e) => {
        if (!selectedId) return;
        const val = (e.target as HTMLInputElement).value;
        // Visual Update only (Server update happens on 'change' to save requests)
        const el = iframe.contentDocument?.querySelector(`[data-editor-id="${selectedId}"]`) as HTMLElement;
        if(el) {
            el.style.setProperty(cssProp, val);
            drawSelectionBox(el); // Resize box if needed
        }
    });
});

function updateElement(id: string, property: string, value: string) {
    fetch('/update-class', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, property, value })
    });
}

// ---- Utilities ----
function rgbToHex(rgb: string) {
    // Handling "rgb(255, 0, 0)" -> "#ff0000"
    if(!rgb || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    const result = rgb.match(/\d+/g);
    if (!result) return '#000000';
    return "#" + result.slice(0, 3).map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function drawSelectionBox(el: HTMLElement) {
    overlay.innerHTML = '';
    const rect = el.getBoundingClientRect();
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.border = '2px solid red';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.pointerEvents = 'none';
    overlay.appendChild(box);
}

// ---- Save Logic ----
saveBtn.addEventListener('click', () => {
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 2000);
    setTimeout(() => window.open('http://localhost:3000/index.html', '_blank'), 500);
});

// ---- Drag Logic (Same as before) ----
function startDrag(realEl: HTMLElement, id: string, startEvent: MouseEvent) {
    startEvent.preventDefault();

    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    
    // State variables
    let isDragging = false;
    let ghost: HTMLElement | null = null;
    let indicator: HTMLElement | null = null;
    let dropTarget: any = null;

    const onMove = (ev: MouseEvent) => {
        const currentX = ev.clientX;
        const currentY = ev.clientY;
        
        // 1. CHECK THRESHOLD: Only start dragging if moved > 5px
        if (!isDragging) {
            const distance = Math.hypot(currentX - startX, currentY - startY);
            if (distance < 5) return; // Ignore tiny movements (jitter)
            
            // WE ARE OFFICIALLY DRAGGING NOW
            isDragging = true;
            
            // Create the Ghost visuals NOW (not before)
            ghost = document.createElement('div');
            ghost.className = 'ghost';
            const rect = realEl.getBoundingClientRect();
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.position = 'absolute';
            ghost.style.border = '2px dashed #007bff';
            ghost.style.backgroundColor = 'rgba(0,123,255,0.1)';
            ghost.style.pointerEvents = 'none'; // Critical
            
            // Initial alignment
            const offsetX = startX - rect.left;
            const offsetY = startY - rect.top;
            ghost.dataset.offsetX = String(offsetX);
            ghost.dataset.offsetY = String(offsetY);

            overlay.appendChild(ghost);

            indicator = document.createElement('div');
            indicator.className = 'indicator';
            indicator.style.pointerEvents = 'none';
            overlay.appendChild(indicator);
            
            // TRAP EVENTS: Make overlay clickable so iframe doesn't steal mouseup
            overlay.style.pointerEvents = 'auto'; 
        }

        // 2. MOVE LOGIC (Only if dragging)
        if (isDragging && ghost && indicator) {
            const offsetX = Number(ghost.dataset.offsetX);
            const offsetY = Number(ghost.dataset.offsetY);
            
            ghost.style.left = (currentX - offsetX) + 'px';
            ghost.style.top = (currentY - offsetY) + 'px';

            ghost.style.display = 'none'; // Hide to peek underneath
            
            const iframeRect = iframe.getBoundingClientRect();
            const lookX = ev.clientX - iframeRect.left;
            const lookY = ev.clientY - iframeRect.top;
            
            const elBelow = iframe.contentDocument?.elementFromPoint(lookX, lookY) as HTMLElement;
            ghost.style.display = 'block';

            if (elBelow) {
                const targetEl = elBelow.closest('[data-editor-id]') as HTMLElement;
                if (targetEl && targetEl !== realEl) {
                    const box = targetEl.getBoundingClientRect();
                    const absTop = box.top + iframeRect.top;
                    const absLeft = box.left + iframeRect.left;
                    const relY = ev.clientY - absTop;
                    
                    if (relY < box.height * 0.25) {
                        dropTarget = { id: targetEl.getAttribute('data-editor-id'), pos: 'before' };
                        showLine(absLeft, absTop, box.width, indicator);
                    } else if (relY > box.height * 0.75) {
                        dropTarget = { id: targetEl.getAttribute('data-editor-id'), pos: 'after' };
                        showLine(absLeft, absTop + box.height, box.width, indicator);
                    } else {
                        dropTarget = { id: targetEl.getAttribute('data-editor-id'), pos: 'inside' };
                        indicator.style.display = 'none';
                    }
                }
            }
        }
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        
        // RESET OVERLAY (Critical to allow clicking iframe again)
        overlay.style.pointerEvents = 'none';

        if (isDragging) {
            ghost?.remove();
            indicator?.remove();

            if (dropTarget) {
                fetch('/reorder-node', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ movedId: id, targetId: dropTarget.id, position: dropTarget.pos })
                }).then(() => iframe.contentWindow?.location.reload());
            }
        }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function showLine(x: number, y: number, w: number, indicator: HTMLElement) {
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    indicator.style.width = w + 'px';
    indicator.style.height = '4px';
    indicator.style.display = 'block';
}