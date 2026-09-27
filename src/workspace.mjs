// A workspace is a folder that holds one "project": brands, video specs, media and renders.
//   studio.json            { name, defaultBrand }
//   brands/<id>.json       brand: name, url, lang, theme colors, logo, font, end-card pills
//   specs/<id>.json        one video each
//   assets/clips|vo|fonts|brand   media used by the videos
//   renders/               finished MP4s     projects/  build output for hyperframes     vo/  TTS cache
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, normalize, formats, formatOf } from './template.mjs';

export const APP_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKELETON = join(APP_ROOT, 'resources', 'workspace');
const readJson = (f, fallback) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJson = (f, data) => writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
export const validId = id => /^[a-z0-9][a-z0-9-]{0,60}$/.test(id);

// ---------- settings (per user, shared by all workspaces) ----------
const SETTINGS_DIR = join(homedir(), '.motion-studio');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');
const settingDefaults = {
  workspace: null, recents: [],
  hyperframes: 'hyperframes@0.8.73',
  python: '', piperVoices: '',
  copyToDownloads: true
};
export function loadSettings() { return { ...settingDefaults, ...readJson(SETTINGS_FILE, {}) }; }
export function saveSettings(s) { mkdirSync(SETTINGS_DIR, { recursive: true }); writeJson(SETTINGS_FILE, s); return s; }

export function isWorkspace(dir) { return !!dir && existsSync(join(dir, 'studio.json')); }

// Creates the folder structure plus a starter brand in `dir`.
export function createWorkspace(dir, name) {
  if (isWorkspace(dir)) throw new Error('Deze map is al een Motion Studio-project.');
  mkdirSync(dir, { recursive: true });
  cpSync(SKELETON, dir, { recursive: true, force: false, errorOnExist: false });
  for (const d of ['specs', 'renders', 'assets/clips', 'assets/vo']) mkdirSync(join(dir, d), { recursive: true });
  writeJson(join(dir, 'studio.json'), { name: name || basename(dir), defaultBrand: 'brand' });
  return new Workspace(dir);
}

export class Workspace {
  constructor(root) {
    if (!isWorkspace(root)) throw new Error(`Geen Motion Studio-project: ${root}`);
    this.root = root;
    this.p = {
      specs: join(root, 'specs'), brands: join(root, 'brands'), assets: join(root, 'assets'),
      clips: join(root, 'assets', 'clips'), vo: join(root, 'assets', 'vo'), fonts: join(root, 'assets', 'fonts'),
      brandAssets: join(root, 'assets', 'brand'), renders: join(root, 'renders'), projects: join(root, 'projects'), voCache: join(root, 'vo')
    };
    for (const d of Object.values(this.p)) mkdirSync(d, { recursive: true });
    // Fonts the template needs; copied from the app when an older workspace lacks them.
    for (const f of ['google-sans-flex-latin.woff2', 'material-symbols.woff2']) {
      if (!existsSync(join(this.p.fonts, f))) cpSync(join(SKELETON, 'assets', 'fonts', f), join(this.p.fonts, f));
    }
  }
  get config() { return { name: basename(this.root), defaultBrand: null, ...readJson(join(this.root, 'studio.json'), {}) }; }
  set config(c) { writeJson(join(this.root, 'studio.json'), c); }

  // specs
  specFile(id) { return join(this.p.specs, `${id}.json`); }
  hasSpec(id) { return existsSync(this.specFile(id)); }
  readSpec(id) { return JSON.parse(readFileSync(this.specFile(id), 'utf8')); }
  writeSpec(id, v) { writeJson(this.specFile(id), { ...v, id }); }
  specs() { return readdirSync(this.p.specs).filter(f => f.endsWith('.json')).map(f => readJson(join(this.p.specs, f), null)).filter(Boolean); }
  trashSpec(id) {
    const trash = join(this.p.specs, '.trash');
    mkdirSync(trash, { recursive: true });
    renameSync(this.specFile(id), join(trash, `${id}-${Date.now()}.json`));
  }

  // brands
  brandIds() { return readdirSync(this.p.brands).filter(f => f.endsWith('.json')).map(f => basename(f, '.json')).sort(); }
  readBrand(id) { return { id, name: id, lang: 'en', url: '', pills: [], theme: {}, ...readJson(join(this.p.brands, `${id}.json`), {}), }; }
  writeBrand(id, b) { const { id: _, logoHtml, ...rest } = b; writeJson(join(this.p.brands, `${id}.json`), rest); }
  brands() { return this.brandIds().map(id => this.readBrand(id)); }
  brandFor(v) {
    const ids = this.brandIds();
    const id = [v.brand, this.config.defaultBrand, ids[0]].find(x => x && ids.includes(x));
    return this.resolveBrand(id ? this.readBrand(id) : { id: 'none', name: 'Brand', theme: {} });
  }
  // Inline SVG logos (so currentColor/fill work), <img> for bitmaps.
  resolveBrand(b) {
    let logoHtml = '';
    const file = b.logo && join(this.p.brandAssets, b.logo);
    if (file && existsSync(file)) {
      logoHtml = extname(file).toLowerCase() === '.svg'
        ? readFileSync(file, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').trim()
        : `<img src="assets/brand/${encodeURI(b.logo)}" alt="" />`;
    }
    return { ...b, logoHtml };
  }
  renderName(v, fmt = '9:16') {
    const b = this.brandFor(v);
    return `${b.renderPrefix || `${b.id}-tiktok`}-${v.id}${formats[formatOf(fmt)].suffix}.mp4`;
  }
  // Formats a video renders to (at least 9:16 when none are ticked).
  formatsOf(v) { const list = (v.formats || []).filter(f => formats[f]); return list.length ? list : ['9:16']; }

  files(dir, exts) { return existsSync(dir) ? readdirSync(dir).filter(f => exts.includes(extname(f).toLowerCase())).sort() : []; }

  html(v, fmt) { return build(v, this.brandFor(v), fmt); }

  // Writes projects/<id><format suffix>/ (index.html + assets) ready for `hyperframes render`; returns the folder name.
  writeProject(v, fmt = '9:16') {
    const name = v.id + formats[formatOf(fmt)].suffix;
    const dir = join(this.p.projects, name);
    mkdirSync(dir, { recursive: true });
    for (const f of ['hyperframes.json', 'meta.json']) {
      const src = existsSync(join(this.root, f)) ? join(this.root, f) : join(SKELETON, f);
      cpSync(src, join(dir, f));
    }
    v = normalize(v);
    // Only the media this video uses, plus fonts and brand files.
    const out = join(dir, 'assets');
    const noTrash = { recursive: true, filter: f => !/[\\/]\.trash([\\/]|$)/.test(f) };
    cpSync(this.p.fonts, join(out, 'fonts'), noTrash);
    cpSync(this.p.brandAssets, join(out, 'brand'), noTrash);
    for (const c of [...v.clips, ...v.clips2]) cpSync(join(this.p.clips, c.src), join(out, 'clips', c.src));
    for (const a of [v.audio, v.music?.src]) if (a) cpSync(join(this.p.vo, a), join(out, 'vo', a));
    writeFileSync(join(dir, 'index.html'), this.html(v, fmt));
    return name;
  }
}
