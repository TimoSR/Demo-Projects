import express from 'express';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import css from 'css';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PUBLIC_DIR = path.join(__dirname, 'public');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');
const CSS_PATH = path.join(PUBLIC_DIR, 'style.css');

// ---- 1. SETUP: Ensure IDs exist on disk ----
function initializeIds() {
    if (!fs.existsSync(HTML_PATH)) return;
    
    console.log("⚙️  Checking index.html for IDs...");
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const $ = cheerio.load(html);
    let modified = false;

    $('body *').each((i, el) => {
        if (!$(el).attr('data-editor-id')) {
            $(el).attr('data-editor-id', `el-${Math.random().toString(36).substr(2, 9)}`);
            modified = true;
        }
    });

    if (modified) {
        fs.writeFileSync(HTML_PATH, $.html());
        console.log("✅ Injected persistent IDs into index.html");
    } else {
        console.log("👍 IDs already present.");
    }
}

// Run this immediately on server start
initializeIds();

// Serve static files
app.use(express.static(PUBLIC_DIR));

// ---- 2. GET Content (Just serve the file) ----
app.get('/content', (req, res) => {
    // We don't inject on the fly anymore. We trust the file on disk.
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    res.send(html);
});

// ---- 3. UPDATE CSS ----
app.post('/update-class', (req, res) => {
    console.log(`🎨 CSS Update: ${req.body.property} -> ${req.body.value}`);
    const { id, property, value } = req.body;
    
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const $ = cheerio.load(html);
    const targetEl = $(`[data-editor-id="${id}"]`);
    
    const className = targetEl.attr('class')?.split(' ')[0];
    if (!className) return res.status(400).json({ error: 'No class found' });

    const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');
    const ast = css.parse(cssContent);

    const rule = ast.stylesheet?.rules.find((r: any) => 
        r.type === 'rule' && r.selectors?.includes(`.${className}`)
    ) as any;

    if (rule) {
        const decl = rule.declarations.find((d: any) => d.property === property);
        if (decl) decl.value = value;
        else rule.declarations.push({ type: 'declaration', property, value });
        
        fs.writeFileSync(CSS_PATH, css.stringify(ast));
        console.log(`✅ Updated style.css for .${className}`);
        res.json({ success: true });
    } else {
        console.log(`❌ Rule .${className} not found in css`);
        res.status(404).json({ error: 'Rule not found' });
    }
});

// ---- 4. REORDER HTML ----
app.post('/reorder-node', (req, res) => {
    console.log(`🔄 Reorder Request: ${req.body.movedId} -> ${req.body.position} -> ${req.body.targetId}`);
    
    const { movedId, targetId, position } = req.body;
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const $ = cheerio.load(html);

    // Look up purely by ID (Robust!)
    const movedNode = $(`[data-editor-id="${movedId}"]`);
    const targetNode = $(`[data-editor-id="${targetId}"]`);

    if (movedNode.length && targetNode.length) {
        const nodeHtml = $.html(movedNode);
        movedNode.remove();

        if (position === 'before') targetNode.before(nodeHtml);
        if (position === 'after') targetNode.after(nodeHtml);
        if (position === 'inside') targetNode.append(nodeHtml);

        // Save immediately. We DO NOT strip IDs, so dragging works next time too.
        fs.writeFileSync(HTML_PATH, $.html());
        console.log("✅ HTML Structure saved to disk.");
        res.json({ success: true });
    } else {
        console.log("❌ Nodes not found. Mismatch?");
        res.status(400).send('Nodes not found');
    }
});

// ---- 5. CLEAN UP (Optional: Remove IDs) ----
// Call this if you want to 'Publish' your site
app.get('/clean', (req, res) => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const $ = cheerio.load(html);
    $('*').removeAttr('data-editor-id');
    fs.writeFileSync(HTML_PATH, $.html());
    res.send('Cleaned IDs from index.html');
});

app.listen(3000, () => console.log('🚀 Builder running on http://localhost:3000/index.html'));