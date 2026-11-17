// ---------- block structures: builds made of blocks, brought in from a structure file ----------
// A structure block's .nbt file (or a .schem schematic) is read here, in the page, and built in 3D: every block on
// its grid, faces hidden where blocks touch, the corners where blocks meet shaded softly, and the blocks that are not
// whole cubes given their shapes (slabs, stairs, fences, panes, carpets, plants, torches, doors). Each block is drawn
// with a small pixel picture Riptide paints itself from the block's name (its stone, wood, wool or glass), so a build
// reads as itself without any game's own pictures. Around it, the parts that make a block world: square clouds
// drifting in a flat layer, a square sun and moon that go where the world's sun is, and block figures to pose.
const Blocks = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);

  // ----- reading NBT: the binary format structure files are saved in -----
  async function gunzip(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf;
    const out = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')));
    return await out.arrayBuffer();
  }
  function readNBT(buf) {
    const d = new DataView(buf), dec = new TextDecoder(); let o = 0;
    const str = () => { const n = d.getUint16(o); o += 2; const s = dec.decode(new Uint8Array(buf, o, n)); o += n; return s; };
    const read = type => {
      switch (type) {
        case 1: return d.getInt8(o++);
        case 2: { const v = d.getInt16(o); o += 2; return v; }
        case 3: { const v = d.getInt32(o); o += 4; return v; }
        case 4: { const v = Number(d.getBigInt64(o)); o += 8; return v; }
        case 5: { const v = d.getFloat32(o); o += 4; return v; }
        case 6: { const v = d.getFloat64(o); o += 8; return v; }
        case 7: { const n = d.getInt32(o); o += 4; const a = new Uint8Array(buf.slice(o, o + n)); o += n; return a; }
        case 8: return str();
        case 9: { const t = d.getUint8(o++), n = d.getInt32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(read(t)); return a; }
        case 10: { const c = {}; for (;;) { const t = d.getUint8(o++); if (t === 0) break; const k = str(); c[k] = read(t); } return c; }
        case 11: { const n = d.getInt32(o); o += 4; const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = d.getInt32(o); o += 4; } return a; }
        case 12: { const n = d.getInt32(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(d.getBigInt64(o)); o += 8; } return a; }
        default: throw new Error('this is not an NBT file (tag ' + type + ')');
      }
    };
    const t = d.getUint8(o++); if (t !== 10) throw new Error('this is not an NBT file');
    str(); return read(10);
  }
  const AIR = /^(minecraft:)?(air|cave_air|void_air|structure_void|barrier|light)$/;
  const short = n => String(n || '').replace(/^minecraft:/, '');
  // "oak_stairs[facing=east,half=bottom]" as a name and its properties
  function parseState(s) {
    const m = String(s).match(/^([^\[]+)(?:\[(.*)\])?$/); const props = {};
    if (m && m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); if (k) props[k.trim()] = String(v ?? '').trim(); }
    return { name: short(m ? m[1] : s), props };
  }

  // A structure as Riptide keeps it: its size, its palette (name and properties) and, for every cell in order (x, then
  // z, then y), its palette entry plus one (0 is air), run-length coded so a project holding one stays small.
  function fromStructure(root) {
    const size = (root.size || []).map(Number); if (size.length !== 3) throw new Error('this .nbt has no size: is it a structure block file?');
    const pal = root.palette || root.palettes?.[0]; if (!pal) throw new Error('this .nbt has no palette');
    const palette = pal.map(p => ({ name: short(p.Name), props: Object.fromEntries(Object.entries(p.Properties || {}).map(([k, v]) => [k, String(v)])) }));
    const [X, Y, Z] = size, grid = new Uint16Array(X * Y * Z);
    for (const b of root.blocks || []) {
      const [x, y, z] = b.pos || []; if (!(x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z)) continue;
      if (AIR.test(palette[b.state]?.name || 'air')) continue;
      grid[(y * Z + z) * X + x] = b.state + 1;
    }
    return { size, palette, grid };
  }
  function fromSchem(root) {
    const s = root.Schematic || root, X = s.Width, Y = s.Height, Z = s.Length;
    if (!(X > 0 && Y > 0 && Z > 0)) throw new Error('this schematic has no size');
    const palObj = s.Blocks?.Palette || s.Palette, data = s.Blocks?.Data || s.BlockData;
    if (!palObj || !data) throw new Error('this schematic has no blocks (only Sponge schematics, version 2 or 3, are read)');
    const palette = []; for (const [k, i] of Object.entries(palObj)) palette[i] = parseState(k);
    const grid = new Uint16Array(X * Y * Z); let at = 0, i = 0;
    while (at < data.length && i < grid.length) {
      let v = 0, shift = 0, b; do { b = data[at++]; v |= (b & 127) << shift; shift += 7; } while (b & 128);
      // the schematic's order is x, then z, then y: the same as ours
      if (palette[v] && !AIR.test(palette[v].name)) grid[i] = v + 1; i++;
    }
    for (let k = 0; k < palette.length; k++) palette[k] ||= { name: 'air', props: {} };
    return { size: [X, Y, Z], palette, grid };
  }
  const pack = grid => { const out = []; for (let i = 0; i < grid.length;) { const v = grid[i]; let n = 1; while (i + n < grid.length && grid[i + n] === v) n++; out.push(v, n); i += n; } return out; };
  const unpack = (runs, n) => { const g = new Uint16Array(n); let i = 0; for (let k = 0; k < runs.length; k += 2) { g.fill(runs[k], i, i + runs[k + 1]); i += runs[k + 1]; } return g; };
  const MOST = 6e6;
  async function read(file) {
    const buf = await gunzip(await file.arrayBuffer()), root = readNBT(buf);
    const st = /\.schem(atic)?$/i.test(file.name) || root.Schematic || root.Width ? fromSchem(root) : fromStructure(root);
    if (st.size[0] * st.size[1] * st.size[2] > MOST) throw new Error(`that build is ${st.size.join(' × ')} blocks: Riptide takes up to 6 million cells`);
    return st;
  }
  // a file as a project asset
  async function importFile(file) {
    const st = await read(file), id = 'blk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const used = new Set(st.grid); const count = st.grid.reduce((n, v) => n + (v ? 1 : 0), 0);
    if (!count) throw new Error(`${file.name} has no blocks in it`);
    S.assets[id] = { kind: 'structure', name: file.name.replace(/\.[^.]+$/, ''), size: st.size, palette: st.palette, runs: pack(st.grid), blocks: count, kinds: used.size - (used.has(0) ? 1 : 0) };
    return id;
  }
  const grids = new Map();
  function structureOf(P) {
    if (P.demo || !P.asset) return demo(P.demo || 'cottage');
    const a = S.assets?.[P.asset]; if (!a || a.kind !== 'structure') return null;
    if (!grids.has(P.asset)) grids.set(P.asset, { size: a.size, palette: a.palette, grid: unpack(a.runs, a.size[0] * a.size[1] * a.size[2]) });
    return grids.get(P.asset);
  }

  // ----- what each block looks like: its shape, how it lets light through, and its pictures -----
  const DYES = { white: '#e4e6e4', orange: '#e8742a', magenta: '#b84cb0', light_blue: '#4aa6d6', yellow: '#eec435', lime: '#74b72a', pink: '#e693ae', gray: '#4a5052',
    light_gray: '#9a9a92', cyan: '#1e8b92', purple: '#7a35a8', blue: '#3a429c', brown: '#77502f', green: '#566f26', red: '#a8312c', black: '#1c1c20' };
  const WOODS = { oak: '#b2925e', spruce: '#77593a', birch: '#cdb77d', jungle: '#ae7f5e', acacia: '#b46437', dark_oak: '#4c3320', mangrove: '#783b36',
    cherry: '#dcb0a6', bamboo: '#c4b25c', crimson: '#6b3550', warped: '#2d6b66', pale_oak: '#e4d9d2' };
  const BARK = { oak: '#7d6343', spruce: '#5a4129', birch: '#dcd9cc', jungle: '#5a4a24', acacia: '#6a6458', dark_oak: '#3b2c19', mangrove: '#5a3a2c', cherry: '#3c2028', crimson: '#5b2335', warped: '#3a4a52', pale_oak: '#8a8580' };
  // the colour a name speaks of, most particular first
  const STUFF = [
    [/mossy_(stone_brick|cobble)/, '#76806a'], [/stone_brick|chiseled_stone|cracked_stone/, '#7f7f80'],
    [/deepslate/, '#4c4c52'], [/blackstone/, '#2c2730'], [/basalt/, '#55555a'], [/tuff/, '#6d6d63'], [/calcite/, '#dcdcd6'], [/granite/, '#9a6b58'], [/diorite/, '#bebebb'], [/andesite/, '#87878a'],
    [/end_stone/, '#dcdea2'], [/purpur/, '#a77ca7'], [/prismarine/, '#5ea193'], [/quartz/, '#ebe5dc'], [/red_sandstone|red_sand/, '#b8642a'], [/sandstone|^sand$|suspicious_sand/, '#dccf9e'],
    [/nether_brick/, '#3a1d22'], [/netherrack/, '#6e3532'], [/soul_s/, '#4f3d31'], [/obsidian/, '#17121f'], [/mud_brick/, '#8a6a52'], [/packed_mud|^mud$/, '#4a3d3a'],
    [/terracotta/, '#97604a'], [/clay/, '#a2a7b4'], [/gravel/, '#857f7d'], [/snow|powder_snow/, '#f2f8f8'], [/blue_ice|packed_ice|^ice$|frosted_ice/, '#8db4f4'],
    [/redstone_lamp/, '#7a5236'], [/copper/, '#c06e50'], [/iron/, '#d8d8d8'], [/gold/, '#f1cf47'], [/diamond/, '#68e0d8'], [/emerald/, '#30c763'], [/lapis/, '#2a4ea6'], [/redstone/, '#a3170f'], [/coal/, '#252526'],
    [/amethyst/, '#8a63bd'], [/hay/, '#b39b2a'], [/melon/, '#79a42b'], [/pumpkin/, '#d58425'], [/sponge/, '#c9c04f'], [/honey/, '#e9a02a'], [/slime/, '#76be6d'],
    [/moss/, '#5f7a32'], [/dirt|farmland|rooted|podzol|mycelium/, '#866043'], [/bricks?$/, '#94574a'], [/bone/, '#e2dccb'], [/glowstone|sea_lantern|shroomlight|froglight/, '#f3d797'],
    [/stone|cobble|furnace|smoker|dispenser|dropper|observer|piston/, '#7d7d7f'],
  ];
  const woodOf = n => Object.keys(WOODS).sort((a, b) => b.length - a.length).find(w => n.includes(w));
  const dyeOf = n => Object.keys(DYES).sort((a, b) => b.length - a.length).find(d => n.startsWith(d + '_') || n.includes('_' + d + '_'));
  const PLANT = /(^|_)(sapling|flower|poppy|dandelion|tulip|orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|short_grass|tall_grass|fern|large_fern|dead_bush|wheat|carrots|potatoes|beetroots|sugar_cane|bamboo_sapling|sweet_berry_bush|mushroom|fungus|roots|sprouts|seagrass|kelp|vine|lilac|rose_bush|peony|sunflower|cobweb|pink_petals|nether_wart|glow_lichen|hanging_roots|bush)$|^grass$/;
  const GLOW = /glowstone|sea_lantern|shroomlight|froglight|lantern|torch|lava|campfire|redstone_lamp\b|beacon|end_rod|magma|jack_o_lantern|candle/;

  // A block's look: { shape, pass: 'solid' | 'cut' | 'clear' | 'water', glow, tiles: { top, side, bottom } } where a
  // tile is a paint order: [style, colour, second colour].
  const looks = new Map();
  function lookOf(b) {
    const key = b.name + JSON.stringify(b.props || {}); if (looks.has(key)) return looks.get(key);
    const n = b.name, p = b.props || {}, wood = woodOf(n), dye = dyeOf(n);
    let base = dye ? DYES[dye] : wood ? WOODS[wood] : (STUFF.find(([re]) => re.test(n)) || [0, '#8a8a8a'])[1];
    if (n === 'redstone_lamp') base = '#f4c86a';
    let shape = 'cube', pass = 'solid', glow = GLOW.test(n) && !/redstone_torch|soul_torch/.test(n) ? 1 : /soul_torch|soul_lantern|redstone_torch/.test(n) ? .6 : 0;
    const t = s => ({ top: s, side: s, bottom: s });
    let tiles = t(['noise', base]);
    // the style of a block's picture, from what it is made of
    if (/_planks$|bookshelf|crafting_table|barrel|chest|composter|lectern|cartography|fletching|loom|smithing/.test(n)) tiles = t(['planks', base]);
    if (/_log$|_wood$|_stem$|_hyphae$|bamboo_block/.test(n) && !/stripped/.test(n)) { const bark = BARK[wood] || '#5c4630';
      tiles = /_wood$|_hyphae$/.test(n) ? t(['bark', bark]) : { top: ['rings', base, bark], side: ['bark', bark], bottom: ['rings', base, bark] }; }
    if (/stripped_.*(_log|_wood|_stem|_hyphae)$/.test(n)) tiles = { top: ['rings', base, base], side: ['grain', base], bottom: ['rings', base, base] };
    if (/bricks?$|brick_(stairs|slab|wall)/.test(n) && !/mud_brick|deepslate_brick|nether_brick|stone_brick/.test(n)) tiles = t(['bricks', base]);
    if (/stone_brick|deepslate_brick|deepslate_tile|polished_blackstone_brick|nether_brick|mud_brick|end_stone_brick|prismarine_brick|quartz_brick|tuff_brick/.test(n)) tiles = t(['blocks', base]);
    if (/cobble|mossy_cobble/.test(n)) tiles = t(['cobble', base]);
    if (/_ore$/.test(n)) { const host = /deepslate/.test(n) ? '#4c4c52' : /nether/.test(n) ? '#6e3532' : '#7d7d7f';
      tiles = t(['ore', host, (STUFF.find(([re]) => re.test(n.replace(/_ore$|deepslate_|nether_/g, ''))) || [0, '#e0e0e0'])[1]]); }
    if (/concrete$/.test(n)) tiles = t(['flat', base]);
    if (/concrete_powder|wool$|carpet$/.test(n)) tiles = t(['wool', base]);
    if (/terracotta/.test(n)) { if (dye) base = new T.Color(DYES[dye]).lerp(new T.Color('#97604a'), .45).getStyle(); tiles = t(/glazed/.test(n) ? ['glazed', base, DYES[dye] || '#ffffff'] : ['flat', base]); }
    if (/_block$/.test(n) && /iron|gold|diamond|emerald|lapis|netherite|copper|coal|redstone|amethyst/.test(n)) tiles = t(['metal', base]);
    if (n === 'grass_block') tiles = { top: ['grass', '#6fae3f'], side: ['grassside', '#866043', '#6fae3f'], bottom: ['noise', '#866043'] };
    if (/podzol|mycelium/.test(n)) tiles = { top: ['noise', n === 'mycelium' ? '#6f6268' : '#5b3f1d'], side: ['grassside', '#866043', n === 'mycelium' ? '#6f6268' : '#5b3f1d'], bottom: ['noise', '#866043'] };
    if (/^(sand|red_sand|gravel|snow_block|clay|dirt|coarse_dirt|soul_sand|soul_soil)$/.test(n)) tiles = t(['grains', base]);
    if (/sandstone/.test(n) && !/smooth|cut|chiseled/.test(n)) tiles = { top: ['grains', base], side: ['layers', base], bottom: ['grains', base] };
    if (/glowstone|sea_lantern|shroomlight|froglight|redstone_lamp/.test(n)) tiles = t(['lamp', base]);
    if (/furnace|smoker|blast_furnace/.test(n)) tiles = { top: ['noise', '#6a6a6c'], side: ['furnace', '#6a6a6c', p.lit === 'true' ? '#ffb347' : '#1c1c1c'], bottom: ['noise', '#6a6a6c'] };
    if (/bookshelf/.test(n)) tiles = { top: ['planks', WOODS.oak], side: ['books', WOODS.oak], bottom: ['planks', WOODS.oak] };
    if (/crafting_table/.test(n)) tiles = { top: ['grid', WOODS.oak], side: ['planks', WOODS.oak], bottom: ['planks', WOODS.oak] };
    if (/pumpkin|melon/.test(n) && !/stem/.test(n)) tiles = { top: ['rings', base, '#6a8a2a'], side: [/jack_o_lantern/.test(n) ? 'face' : 'ribs', base], bottom: ['rings', base, base] };
    if (/hay_block/.test(n)) tiles = { top: ['rings', base, '#8c6f1c'], side: ['straw', base], bottom: ['rings', base, '#8c6f1c'] };
    if (/tnt/.test(n)) { const c = /purple|violet/.test(n) ? '#8a3fd4' : /blue/.test(n) ? '#3b62d4' : /green/.test(n) ? '#3fa24a' : '#d43b2b';
      tiles = { top: ['flat', c], side: ['band', c, '#efe9df'], bottom: ['flat', c] }; if (/purple|violet/.test(n)) glow = .35; }
    // what light goes through
    if (/glass/.test(n)) { pass = 'clear'; tiles = t(['glass', dye ? DYES[dye] : '#cfe6ee']); }
    if (/ice$/.test(n) && !/packed|blue/.test(n)) { pass = 'clear'; tiles = t(['glass', '#9ec4f6']); }
    if (/leaves/.test(n)) { pass = 'cut'; const c = /birch/.test(n) ? '#80a755' : /spruce/.test(n) ? '#5f7d4a' : /cherry/.test(n) ? '#eaa7c0' : /azalea/.test(n) ? '#6c8f2f' : /mangrove/.test(n) ? '#8db127' : '#4f8f2a'; tiles = t(['leaves', c]); }
    if (/^water$|bubble_column/.test(n)) { pass = 'water'; tiles = t(['water', '#3f6fd8']); }
    if (/^lava$/.test(n)) { glow = 1.2; tiles = t(['lava', '#e5641a']); }
    // shapes
    if (/_slab$/.test(n)) shape = p.type === 'double' ? 'cube' : p.type === 'top' ? 'slabTop' : 'slab';
    else if (/_stairs$/.test(n)) shape = 'stairs';
    else if (/_fence$/.test(n) && !/gate/.test(n)) shape = 'fence';
    else if (/_fence_gate$/.test(n)) shape = 'gate';
    else if (/_wall$/.test(n) && !/sign|banner|torch|fan|head|skull/.test(n)) shape = 'wall';
    else if (/_pane$|^iron_bars$/.test(n)) { shape = 'pane'; pass = /iron_bars/.test(n) ? 'cut' : 'clear'; if (/iron_bars/.test(n)) tiles = t(['bars', '#5d5f60']); }
    else if (/carpet$|pressure_plate$|^moss_carpet$|^snow$|lily_pad/.test(n)) shape = n === 'snow' ? 'layer' : 'carpet';
    else if (/torch$/.test(n)) { shape = /wall_torch/.test(n) ? 'wallTorch' : 'torch'; pass = 'cut'; tiles = t(['torch', '#6a5132', /soul/.test(n) ? '#7fe3f0' : /redstone/.test(n) ? '#ff3b2b' : '#ffd36b']); }
    else if (/lantern$/.test(n)) { shape = 'lantern'; pass = 'cut'; tiles = t(['lamp', /soul/.test(n) ? '#7fe3f0' : '#f6c35a']); }
    else if (/(^|_)rail$/.test(n)) { shape = 'rail'; pass = 'cut';
      const ew = /east_west|ascending_east|ascending_west/.test(p.shape || ''), lit = /powered|golden/.test(n) ? '#e2b93b' : /detector|activator/.test(n) ? '#a3170f' : '';
      tiles = t([ew ? 'railx' : 'rail', '#8a8a8e', lit || '#6a5132']); }
    else if (/^(sticky_)?piston$/.test(n)) { shape = 'piston'; tiles = { top: ['planks', WOODS.oak], side: ['noise', '#7d7d7f'], bottom: ['noise', '#6a6a6c'] }; }
    else if (/^piston_head$|^moving_piston$/.test(n)) shape = 'none';
    else if (/_door$/.test(n)) { shape = 'door'; pass = 'cut'; tiles = t(['door', wood ? WOODS[wood] : '#d8d8d8']); }
    else if (/_trapdoor$/.test(n)) { shape = 'trapdoor'; pass = 'cut'; tiles = t(['door', wood ? WOODS[wood] : '#d8d8d8']); }
    else if (/_sign$|_banner$|button$|lever$|ladder$|rail$|_head$|_skull$|flower_pot|candle|tripwire|redstone_wire|frame|painting/.test(n)) shape = 'none';
    else if (PLANT.test(n) || /_(sapling|tulip|orchid)$/.test(n)) { shape = 'cross'; pass = 'cut';
      const c = /wheat|hay/.test(n) ? '#c9b14a' : /dead_bush/.test(n) ? '#8a6a3c' : /mushroom|fungus/.test(n) ? (/red/.test(n) ? '#c8302a' : '#b08a64') : /cobweb/.test(n) ? '#e8e8e8' : '#5a9a34';
      const flower = /poppy|rose|red_tulip/.test(n) ? '#d8322a' : /dandelion|sunflower/.test(n) ? '#f2d33a' : /orchid|cornflower/.test(n) ? '#4aa2e0' : /allium|lilac|peony/.test(n) ? '#b86ad0'
        : /oxeye|azure|lily_of|white_tulip/.test(n) ? '#f1efe6' : /orange_tulip|torchflower/.test(n) ? '#ef8a2a' : /pink/.test(n) ? '#f2a0c0' : '';
      tiles = t([flower ? 'flower' : 'plant', c, flower]); }
    else if (/chest$/.test(n)) shape = 'chest';
    else if (/^bed$|_bed$/.test(n)) shape = 'bed';
    const look = { shape, pass, glow, tiles, props: p, name: n };
    looks.set(key, look); return look;
  }

  // ----- the pictures: 16 pixels square, painted from a few styles, all on one sheet -----
  const TILE = 16;
  function hash(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function paint(g, ox, oy, [style, c1, c2], seed) {
    const A = new T.Color(c1 || '#888'), B = new T.Color(c2 || c1 || '#888');
    const px = (x, y, col, a = 1) => { g.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`; g.fillRect(ox + x, oy + y, 1, 1); };
    const shade = (col, k) => col.clone().multiplyScalar(k);
    const r = (x, y, s = 0) => hash(x + seed * 31, y + s * 17, seed);
    g.clearRect(ox, oy, TILE, TILE);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let col = A, a = 1, k = .9 + r(x, y) * .2;
      switch (style) {
        case 'flat': k = .97 + r(x, y) * .06; break;
        case 'wool': k = .92 + r(x, y) * .1 + ((x + y) % 4 === 0 ? -.04 : 0); break;
        case 'grains': k = .82 + r(x, y) * .3; break;
        case 'metal': k = (x === 0 || y === 0 ? 1.12 : x === 15 || y === 15 ? .78 : .97 + r(x, y) * .05); break;
        case 'planks': { const row = Math.floor(y / 4), seam = y % 4 === 3, cut = (x + row * 7) % 16 === 0; k = seam || cut ? .68 : .88 + r(x >> 1, y, row) * .16 + (r(row, 0, 9) - .5) * .1; break; }
        case 'grain': k = .86 + r(x, 0, 3) * .2 + r(x, y) * .05; break;
        case 'bark': k = .72 + r(x, y >> 2, 5) * .4 - (x % 3 === 0 ? .12 : 0); break;
        case 'rings': { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); col = d > 6.5 ? B : A; k = d > 6.5 ? .9 + r(x, y) * .15 : (Math.floor(d) % 2 ? .82 : 1) + r(x, y) * .06; break; }
        case 'bricks': { const row = Math.floor(y / 4), seam = y % 4 === 3 || (x + (row % 2 ? 4 : 0)) % 8 === 7; col = seam ? new T.Color('#c9c2b6') : A; k = seam ? .9 : .85 + r(x >> 2, row) * .25 + r(x, y) * .06; break; }
        case 'blocks': { const row = Math.floor(y / 8), seam = y % 8 === 7 || (x + (row % 2 ? 8 : 0)) % 16 === 15; k = seam ? .62 : .9 + r(x, y) * .14; break; }
        case 'cobble': { const cx = Math.floor((x + r(0, y >> 2, 4) * 3) / 5), cy = Math.floor((y + r(x >> 2, 0, 8) * 3) / 5), e = hash(cx, cy, seed); k = .62 + e * .5 + r(x, y) * .1;
          if ((x + Math.round(e * 3)) % 5 === 0 || (y + Math.round(e * 2)) % 5 === 0) k = .5; break; }
        case 'ore': { const spot = hash(x >> 1, y >> 1, seed + 5) > .82 && x > 1 && y > 1 && x < 14 && y < 14; if (spot) { col = B; k = .85 + r(x, y) * .3; } break; }
        case 'grass': k = .8 + r(x, y) * .35; break;
        case 'grassside': { const edge = 3 + Math.floor(r(x, 0, 2) * 3); if (y < edge) { col = B; k = .8 + r(x, y) * .3; } else k = .82 + r(x, y) * .3; break; }
        case 'layers': k = (y % 5 === 4 ? .8 : .93) + r(x, y) * .1; break;
        case 'lamp': { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); k = d > 6.5 ? .7 : 1 + r(x, y) * .15 - (d > 4 ? .1 : 0); break; }
        case 'glass': { const edge = x === 0 || y === 0 || x === 15 || y === 15, glint = (x - y === 3 || x - y === 4) && x > 3 && x < 11; a = edge ? .85 : glint ? .45 : .14; k = edge ? .85 : 1.15; break; }
        case 'leaves': { a = r(x, y, 2) > .22 ? 1 : 0; k = .7 + r(x, y) * .45; break; }
        case 'water': k = .85 + Math.sin((x + y * 1.7) * .9 + r(0, y) * 2) * .08 + r(x, y) * .05; a = .8; break;
        case 'lava': k = .8 + r(x >> 1, y >> 1, 3) * .45; col = r(x >> 1, y >> 1, 4) > .7 ? new T.Color('#ffd25a') : A; break;
        case 'furnace': { const mouth = x > 3 && x < 12 && y > 8 && y < 14; if (mouth) { col = B; k = 1; } else k = (y === 0 || x === 0 ? 1.08 : .9) + r(x, y) * .1; break; }
        case 'books': { const shelf = y < 2 || y > 13 || y === 7 || y === 8; if (!shelf) { col = new T.Color(['#8a2e2a', '#2c4f8a', '#3c6a2e', '#7a6a2a', '#5a2e6a'][Math.floor(hash(x >> 1, y > 7 ? 1 : 0, 3) * 5)]); k = .85 + r(x, y) * .2; } else k = .8 + r(x, y) * .1; break; }
        case 'grid': k = x % 5 === 0 || y % 5 === 0 ? .6 : .95 + r(x, y) * .1; break;
        case 'ribs': k = (x % 4 === 0 ? .78 : .95) + r(x, y) * .08; break;
        case 'face': { const eye = (y > 4 && y < 7 && (x === 4 || x === 5 || x === 10 || x === 11)), mouth = y > 9 && y < 12 && x > 3 && x < 12 && (x + y) % 3 !== 0; if (eye || mouth) { col = new T.Color('#ffd25a'); k = 1.1; } else k = (x % 4 === 0 ? .78 : .95) + r(x, y) * .08; break; }
        case 'straw': k = (x % 3 === 0 ? .78 : .95) + r(x, y >> 1) * .15; break;
        case 'band': if (y > 4 && y < 11) { col = B; k = 1; if (y > 5 && y < 10 && x > 2 && x < 13 && (x + y) % 2) col = new T.Color('#1c1c1c'); } break;
        case 'glazed': { const d = Math.abs(x - y), e = Math.abs(x + y - 15); if (d < 2 || e < 2) { col = B; k = .95; } else k = .95 + r(x, y) * .06; break; }
        case 'rail': case 'railx': {
          // sleepers across, two steel rails along, drawn for a track running north-south (railx: east-west)
          const u = style === 'railx' ? y : x, v = style === 'railx' ? x : y;
          const rail = u === 3 || u === 12, tie = (v % 4 === 1 || v % 4 === 2) && u > 0 && u < 15;
          a = rail || tie ? 1 : 0; if (rail) { col = A; k = 1.05 + (u === 3 ? .1 : -.05) + r(u, v) * .05; } else { col = B; k = .75 + r(u >> 1, v >> 2) * .25; } break; }
        case 'bars': { a = (x % 4 === 1 || y === 1 || y === 14) ? 1 : 0; k = .9 + r(x, y) * .15; break; }
        case 'door': { const frame = x === 0 || x === 15 || y === 0 || y === 15 || y === 7, win = x > 2 && x < 13 && y > 1 && y < 6 && !(x === 7 || x === 8); if (win) a = 0; k = frame ? .75 : .9 + r(x >> 1, y) * .14; break; }
        case 'torch': { a = 0; if (x === 7 || x === 8) { if (y >= 9) { a = 1; col = A; k = .9 + r(x, y) * .1; } else if (y >= 6) { a = 1; col = B; k = 1.2; } } break; }
        case 'plant': { const blade = Math.abs(x - 7.5 - Math.sin(y * .7 + x) * 2) < 1.2 + (y > 8 ? .6 : 0) || (hash(x, y, seed) > .8 && y > 5); a = blade ? 1 : 0; k = .7 + r(x, y) * .4 + (15 - y) * .01; break; }
        case 'flower': { const stem = (x === 7 || x === 8) && y > 6, leaf = y > 10 && y < 13 && (x === 5 || x === 6 || x === 9 || x === 10), head = Math.hypot(x - 7.5, y - 4.5) < 3.2;
          a = stem || leaf || head ? 1 : 0; if (head) { col = B; k = .9 + r(x, y) * .2; if (Math.hypot(x - 7.5, y - 4.5) < 1) col = new T.Color('#f2d33a'); } else k = .8 + r(x, y) * .2; break; }
        default: k = .86 + r(x, y) * .24;
      }
      if (a > 0) px(x, y, shade(col, k), a);
    }
  }
  function atlasFor(looksUsed) {
    const tiles = new Map();   // paint order (as text) -> index
    for (const l of looksUsed) for (const f of ['top', 'side', 'bottom']) { const k = JSON.stringify(l.tiles[f]); if (!tiles.has(k)) tiles.set(k, tiles.size); }
    const cols = Math.min(64, Math.ceil(Math.sqrt(tiles.size))), rows = Math.ceil(tiles.size / cols);
    const cv = document.createElement('canvas'); cv.width = cols * TILE; cv.height = Math.max(1, rows) * TILE; const g = cv.getContext('2d');
    for (const [k, i] of tiles) paint(g, (i % cols) * TILE, Math.floor(i / cols) * TILE, JSON.parse(k), i * 7 + 3);
    const tex = new T.CanvasTexture(cv); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = T.SRGBColorSpace;
    return { tex, cols, rows, at: order => { const i = tiles.get(JSON.stringify(order)) ?? 0; return [i % cols, Math.floor(i / cols)]; } };
  }

  // ----- building it: faces where a block meets air, shaded in the corners -----
  // each face: its normal, and from its origin corner the u and v directions (u x v = the normal), as unit vectors
  const FACES = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: (a, b) => [b[0], a[1], b[2]], tile: 'side' },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: (a, b) => [a[0], a[1], a[2]], tile: 'side' },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: (a, b) => [a[0], b[1], b[2]], tile: 'top' },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: (a, b) => [a[0], a[1], a[2]], tile: 'bottom' },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: (a, b) => [a[0], a[1], b[2]], tile: 'side' },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: (a, b) => [b[0], a[1], a[2]], tile: 'side' },
  ];
  const AOK = [.5, .68, .84, 1];
  function build(st, skip = null) {
    const [X, Y, Z] = st.size, grid = st.grid, lk = st.palette.map(p => (AIR.test(p.name) ? null : lookOf(p)));
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? 0 : grid[(y * Z + z) * X + x]);
    const look = (x, y, z) => { const v = at(x, y, z); return v ? lk[v - 1] : null; };
    const solid = (x, y, z) => { const l = look(x, y, z); return !!l && l.shape === 'cube' && l.pass === 'solid'; };
    const used = new Set(); for (let i = 0; i < grid.length; i++) if (grid[i] && lk[grid[i] - 1]) used.add(lk[grid[i] - 1]);
    const atlas = atlasFor([...used]);
    const buckets = {}; const bucket = k => (buckets[k] ||= { pos: [], nor: [], uv: [], col: [], idx: [] });
    const passOf = l => (l.glow ? 'glow' : l.pass);
    // one face of the box A..B (block-local, 0..1) of the block at X,Y,Z
    function face(Bk, f, a, b, bx, by, bz, order, ao) {
      const o = f.o(a, b), du = Math.abs(f.u[0]) * (b[0] - a[0]) + Math.abs(f.u[1]) * (b[1] - a[1]) + Math.abs(f.u[2]) * (b[2] - a[2]);
      const dv = Math.abs(f.v[0]) * (b[0] - a[0]) + Math.abs(f.v[1]) * (b[1] - a[1]) + Math.abs(f.v[2]) * (b[2] - a[2]);
      const [tx, ty] = atlas.at(order), base = Bk.pos.length / 3;
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      corners.forEach(([cu, cv], i) => {
        const p = [0, 1, 2].map(k => o[k] + f.u[k] * du * cu + f.v[k] * dv * cv);
        Bk.pos.push(bx + p[0], by + p[1], bz + p[2]); Bk.nor.push(...f.n);
        // where in the picture: how far along u and v, measured in the block from its own corner
        const s = [0, 1, 2].reduce((m, k) => m + f.u[k] * p[k], 0) + (f.u.some(c => c < 0) ? 1 : 0);
        const t = [0, 1, 2].reduce((m, k) => m + f.v[k] * p[k], 0) + (f.v.some(c => c < 0) ? 1 : 0);
        Bk.uv.push((tx + clamp(s, 0, 1)) / atlas.cols, 1 - (ty + 1 - clamp(t, 0, 1)) / atlas.rows);
        const k = ao ? ao[i] : 1; Bk.col.push(k, k, k);
      });
      // turn the quad so the shading runs smoothly across it
      if (ao && ao[0] + ao[2] < ao[1] + ao[3]) Bk.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else Bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const box = (Bk, l, x, y, z, a, b, skip = () => false) => FACES.forEach(f => { if (!skip(f)) face(Bk, f, a, b, x, y, z, l.tiles[f.tile]); });
    const cross = (Bk, l, x, y, z, h = 1) => {
      const [tx, ty] = atlas.at(l.tiles.side), base = Bk.pos.length / 3, e = .15;
      for (const [p0, p1] of [[[e, e], [1 - e, 1 - e]], [[e, 1 - e], [1 - e, e]]]) {
        const b0 = Bk.pos.length / 3;
        for (const [px, pz, py, s, t] of [[p0[0], p0[1], 0, 0, 0], [p1[0], p1[1], 0, 1, 0], [p1[0], p1[1], h, 1, 1], [p0[0], p0[1], h, 0, 1]]) {
          Bk.pos.push(x + px, y + py, z + pz); Bk.nor.push(0, 1, 0); Bk.uv.push((tx + s) / atlas.cols, 1 - (ty + 1 - t) / atlas.rows); Bk.col.push(1, 1, 1); }
        Bk.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      }
      void base;
    };
    const facing = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
    const joins = (x, y, z, l) => { const o = look(x, y, z); return !!o && (solid(x, y, z) || o.shape === l.shape || (l.shape === 'fence' && o.shape === 'gate') || (/pane|wall/.test(l.shape) && /pane|wall/.test(o.shape))); };
    for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const gi = (y * Z + z) * X + x, v = grid[gi]; if (!v || (skip && skip.has(gi))) continue; const l = lk[v - 1]; if (!l || l.shape === 'none') continue;
      const Bk = bucket(passOf(l)), p = l.props;
      if (l.shape === 'cube') {
        for (const f of FACES) {
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2], o = look(nx, ny, nz);
          if (o && ((o.shape === 'cube' && o.pass === 'solid') || (o === l && l.pass !== 'cut') || (o.pass === l.pass && l.pass !== 'solid' && l.pass !== 'cut' && o.shape === 'cube'))) continue;
          if (l.pass === 'water' && f.n[1] === 1 && o) continue;
          // shade each corner by what touches it in front of the face
          const ao = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([cu, cv]) => {
            const su = cu ? 1 : -1, sv = cv ? 1 : -1, d = [0, 1, 2].map(k => f.n[k]);
            const side1 = solid(nx + f.u[0] * su, ny + f.u[1] * su, nz + f.u[2] * su), side2 = solid(nx + f.v[0] * sv, ny + f.v[1] * sv, nz + f.v[2] * sv);
            const corner = solid(nx + f.u[0] * su + f.v[0] * sv, ny + f.u[1] * su + f.v[1] * sv, nz + f.u[2] * su + f.v[2] * sv); void d;
            return AOK[side1 && side2 ? 0 : 3 - (side1 + side2 + corner)];
          });
          const top = l.pass === 'water' && !look(x, y + 1, z) ? .875 : 1;
          face(Bk, f, [0, 0, 0], [1, top, 1], x, y, z, l.tiles[f.tile], l.pass === 'solid' || l.pass === 'cut' ? ao : null);
        }
        continue;
      }
      switch (l.shape) {
        case 'slab': box(Bk, l, x, y, z, [0, 0, 0], [1, .5, 1], f => f.n[1] === -1 && solid(x, y - 1, z)); break;
        case 'slabTop': box(Bk, l, x, y, z, [0, .5, 0], [1, 1, 1], f => f.n[1] === 1 && solid(x, y + 1, z)); break;
        case 'stairs': {
          const up = p.half === 'top', [fx, fz] = facing[p.facing] || [0, -1];
          box(Bk, l, x, y, z, [0, up ? .5 : 0, 0], [1, up ? 1 : .5, 1]);
          // the step rises on the side it faces
          const a = [fx > 0 ? .5 : 0, up ? 0 : .5, fz > 0 ? .5 : 0], b = [fx < 0 ? .5 : 1, up ? .5 : 1, fz < 0 ? .5 : 1];
          if (!fx) { a[0] = 0; b[0] = 1; } if (!fz) { a[2] = 0; b[2] = 1; }
          box(Bk, l, x, y, z, a, b); break; }
        case 'carpet': box(Bk, l, x, y, z, [0, 0, 0], [1, 1 / 16, 1]); break;
        case 'layer': box(Bk, l, x, y, z, [0, 0, 0], [1, Math.min(8, +p.layers || 1) * 2 / 16, 1]); break;
        case 'fence': case 'wall': case 'pane': case 'gate': {
          const w = l.shape === 'wall' ? .25 : l.shape === 'pane' ? 1 / 16 : .125, top = l.shape === 'wall' ? .875 : 1;
          if (l.shape !== 'pane' && l.shape !== 'gate') box(Bk, l, x, y, z, [.5 - w, 0, .5 - w], [.5 + w, l.shape === 'wall' ? 1 : 1, .5 + w]);
          const arm = l.shape === 'pane' ? [0, 1] : l.shape === 'wall' ? [0, top] : null;
          const dirs = l.shape === 'gate' ? (p.facing === 'east' || p.facing === 'west' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]])
            : [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => joins(x + dx, y, z + dz, l));
          if (l.shape === 'pane' && !dirs.length) dirs.push([1, 0], [-1, 0]);
          for (const [dx, dz] of dirs) {
            const a = [dx > 0 ? .5 : dx < 0 ? 0 : .5 - w, 0, dz > 0 ? .5 : dz < 0 ? 0 : .5 - w], b = [dx > 0 ? 1 : dx < 0 ? .5 : .5 + w, 1, dz > 0 ? 1 : dz < 0 ? .5 : .5 + w];
            if (arm) { a[1] = arm[0]; b[1] = arm[1]; if (l.shape === 'pane') { /* a full-height glass sheet */ } box(Bk, l, x, y, z, a, b); }
            else for (const [y0, y1] of [[.375, .5625], [.75, .9375]]) { const aa = [...a], bb = [...b]; aa[1] = y0; bb[1] = y1; if (dx) { aa[2] = .5 - w / 2; bb[2] = .5 + w / 2; } else { aa[0] = .5 - w / 2; bb[0] = .5 + w / 2; } box(Bk, l, x, y, z, aa, bb); }
          }
          break; }
        case 'torch': box(bucket('glow'), l, x, y, z, [7 / 16, 0, 7 / 16], [9 / 16, 10 / 16, 9 / 16]); break;
        case 'wallTorch': { const [fx, fz] = facing[p.facing] || [0, 1]; const cx = .5 - fx * .32, cz = .5 - fz * .32;
          box(bucket('glow'), l, x, y, z, [cx - 1 / 16, .2, cz - 1 / 16], [cx + 1 / 16, .8, cz + 1 / 16]); break; }
        case 'lantern': box(bucket('glow'), l, x, y, z, [5 / 16, p.hanging === 'true' ? .3 : 0, 5 / 16], [11 / 16, p.hanging === 'true' ? .75 : .45, 11 / 16]); break;
        case 'door': case 'trapdoor': {
          const t = 3 / 16, [fx, fz] = facing[p.facing] || [0, 1], open = p.open === 'true';
          if (l.shape === 'trapdoor' && !open) { const top = p.half === 'top'; box(Bk, l, x, y, z, [0, top ? 1 - t : 0, 0], [1, top ? 1 : t, 1]); break; }
          // a closed door stands on the far side of its block from where it faces; open, it swings to the hinge side
          let ax = fx, az = fz; if (open) { const hinge = p.hinge === 'left' ? 1 : -1; [ax, az] = [-fz * hinge, fx * hinge]; }
          const a = [ax > 0 ? 0 : ax < 0 ? 1 - t : 0, 0, az > 0 ? 0 : az < 0 ? 1 - t : 0], b = [ax > 0 ? t : 1, 1, az > 0 ? t : 1];
          box(Bk, l, x, y, z, a, b); break; }
        case 'chest': box(Bk, l, x, y, z, [1 / 16, 0, 1 / 16], [15 / 16, 14 / 16, 15 / 16]); break;
        case 'rail': box(Bk, l, x, y, z, [0, 0, 0], [1, 1 / 16, 1], f => f.n[1] !== 1); break;
        case 'piston': box(Bk, l, x, y, z, [0, 0, 0], [1, 1, 1]); break;
        case 'bed': box(Bk, l, x, y, z, [0, 0, 0], [1, 9 / 16, 1]); break;
        case 'cross': cross(Bk, l, x, y, z, 1); break;
      }
    }
    // the materials: solid, cut-out (leaves, plants), glass, water, and what glows
    const mats = {
      solid: new T.MeshStandardMaterial({ map: atlas.tex, vertexColors: true, roughness: .92, metalness: 0 }),
      cut: new T.MeshStandardMaterial({ map: atlas.tex, vertexColors: true, roughness: .9, alphaTest: .5, side: T.DoubleSide }),
      clear: new T.MeshPhysicalMaterial({ map: atlas.tex, vertexColors: true, roughness: .05, transparent: true, depthWrite: false, side: T.DoubleSide, envMapIntensity: 1.2 }),
      water: new T.MeshPhysicalMaterial({ map: atlas.tex, vertexColors: true, roughness: .08, transparent: true, opacity: .78, depthWrite: false, side: T.DoubleSide }),
      glow: new T.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: new T.Color('#ffffff'), emissiveIntensity: 1.6, vertexColors: true, roughness: .8, alphaTest: .5, side: T.DoubleSide }),
    };
    const g = new T.Group();
    for (const [k, Bk] of Object.entries(buckets)) {
      if (!Bk.idx.length) continue;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(Bk.pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(Bk.nor, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(Bk.uv, 2)); geo.setAttribute('color', new T.Float32BufferAttribute(Bk.col, 3));
      geo.setIndex(Bk.pos.length / 3 > 65535 ? new T.Uint32BufferAttribute(Bk.idx, 1) : new T.Uint16BufferAttribute(Bk.idx, 1));
      geo.computeBoundingSphere();
      const m = new T.Mesh(geo, mats[k]); m.castShadow = k !== 'water' && k !== 'clear'; m.receiveShadow = true; if (k === 'clear' || k === 'water') m.renderOrder = 2;
      g.add(m);
    }
    // a few real lights from what glows, so a build at night lights itself (the brightest dozen, spread out)
    const lamps = []; for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) { const v = at(x, y, z); if (v && lk[v - 1]?.glow) lamps.push([x + .5, y + .6, z + .5, lk[v - 1]]); }
    const chosen = []; for (const L of lamps) if (chosen.length < 12 && chosen.every(c => Math.hypot(c[0] - L[0], c[1] - L[1], c[2] - L[2]) > 6)) chosen.push(L);
    for (const [x, y, z, l] of chosen) { const c = new T.Color(l.tiles.side[2] || l.tiles.side[1] || '#ffcf7a'); const pl = new T.PointLight(c, 1.2 * l.glow, 12 * M, 2); pl.position.set(x, y, z); pl.userData.blockLamp = true; g.add(pl); }
    g.userData.size = st.size;
    return g;
  }

  // ----- a build to start from: a cottage on a floating island, made in code -----
  const demos = new Map();
  function demo(kind) {
    if (demos.has(kind)) return demos.get(kind);
    if (kind === 'jungle') { const st = jungle(); demos.set(kind, st); return st; }
    const X = 26, Y = 26, Z = 26, grid = new Uint16Array(X * Y * Z), palette = [], ids = new Map();
    const id = (name, props = {}) => { const k = name + JSON.stringify(props); if (!ids.has(k)) { ids.set(k, palette.length); palette.push({ name, props }); } return ids.get(k) + 1; };
    const set = (x, y, z, name, props) => { if (x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z) grid[(y * Z + z) * X + x] = id(name, props); };
    const get = (x, y, z) => grid[(y * Z + z) * X + x];
    let s = 11; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    // the island: grass on top, dirt, then stone tapering to a point
    const top = 10, cx = 12.5, cz = 12.5;
    for (let y = 0; y <= top; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const d = Math.hypot(x - cx, z - cz), wob = Math.sin(x * .9) * .8 + Math.cos(z * .7) * .8 + Math.sin((x + z) * .4) * .6;
      const r = (11.5 + wob * .6) * Math.pow((y + 1) / (top + 1), .55);
      if (d > r) continue;
      set(x, y, z, y === top ? 'grass_block' : y > top - 3 ? 'dirt' : rnd() < .06 ? 'coal_ore' : rnd() < .03 ? 'iron_ore' : rnd() < .2 ? 'andesite' : 'stone');
    }
    const ground = top + 1;
    if (kind === 'island') {
      for (let i = 0; i < 30; i++) { const x = Math.floor(rnd() * X), z = Math.floor(rnd() * Z), d = Math.hypot(x - cx, z - cz);
        if (d > 8 && get(x, top, z) === id('grass_block')) set(x, ground, z, ['short_grass', 'poppy', 'dandelion', 'short_grass', 'cornflower'][Math.floor(rnd() * 5)]); }
      const st = { size: [X, Y, Z], palette, grid }; demos.set(kind, st); return st;
    }
    // the cottage: cobble footing, oak log corners, plank walls, glass windows, a door, a stair roof, a chimney
    const x0 = 7, x1 = 15, z0 = 7, z1 = 13;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) set(x, ground - 1, z, 'cobblestone');
    for (let y = ground; y < ground + 4; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1; if (!edgeX && !edgeZ) continue;
      if (edgeX && edgeZ) set(x, y, z, 'oak_log', { axis: 'y' });
      else if (y === ground) set(x, y, z, 'cobblestone');
      else set(x, y, z, 'oak_planks');
    }
    for (const x of [9, 10, 12, 13]) for (const y of [ground + 1, ground + 2]) set(x, y, z1, 'glass_pane');
    for (const z of [9, 11]) for (const y of [ground + 1, ground + 2]) { set(x0, y, z, 'glass_pane'); set(x1, y, z, 'glass_pane'); }
    set(11, ground, z1, 'oak_door', { facing: 'south', half: 'lower', hinge: 'left', open: 'false' }); set(11, ground + 1, z1, 'oak_door', { facing: 'south', half: 'upper', hinge: 'left', open: 'false' });
    for (let i = 0; i <= 4; i++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const y = ground + 4 + i; if (z0 - 1 + i > z1 + 1 - i) break;
      set(x, y, z0 - 1 + i, 'spruce_stairs', { facing: 'south', half: 'bottom' }); set(x, y, z1 + 1 - i, 'spruce_stairs', { facing: 'north', half: 'bottom' });
      if (x === x0 || x === x1) for (let z = z0 + i; z <= z1 - i; z++) set(x, y, z, 'oak_planks');
      if (z0 - 1 + i === z1 + 1 - i) set(x, y, z0 - 1 + i, 'spruce_slab', { type: 'bottom' });
    }
    for (let y = ground; y < ground + 10; y++) set(x1 - 1, y, z0 + 1, y < ground + 3 ? 'cobblestone' : 'bricks');
    set(x1 - 1, ground, z0 + 1, 'furnace', { lit: 'true', facing: 'south' });
    set(x0 + 1, ground, z0 + 1, 'crafting_table'); set(x0 + 1, ground, z1 - 1, 'bookshelf'); set(x0 + 2, ground + 2, z0 + 1, 'wall_torch', { facing: 'south' });
    // a path to the door, a lantern on a fence post, flowers
    for (let z = z1 + 1; z < 21; z++) set(11, ground - 1, z, 'gravel');
    set(13, ground, z1 + 2, 'oak_fence'); set(13, ground + 1, z1 + 2, 'lantern');
    // a tree
    const tx = 19, tz = 8;
    for (let y = ground; y < ground + 5; y++) set(tx, y, tz, 'oak_log', { axis: 'y' });
    for (let y = ground + 3; y < ground + 7; y++) { const r = y < ground + 5 ? 2 : 1;
      for (let x = tx - r; x <= tx + r; x++) for (let z = tz - r; z <= tz + r; z++) if (!(Math.abs(x - tx) === r && Math.abs(z - tz) === r && rnd() < .7) && !get(x, y, z)) set(x, y, z, 'oak_leaves'); }
    // a little pond
    for (const [x, z] of [[17, 15], [18, 15], [17, 16], [18, 16], [19, 16], [18, 17]]) { set(x, top, z, 'water'); set(x, top - 1, z, 'sand'); }
    for (let i = 0; i < 26; i++) { const x = Math.floor(rnd() * X), z = Math.floor(rnd() * Z);
      if (get(x, top, z) === id('grass_block') && !get(x, ground, z)) set(x, ground, z, ['short_grass', 'poppy', 'dandelion', 'short_grass', 'cornflower', 'oxeye_daisy'][Math.floor(rnd() * 6)]); }
    const st = { size: [X, Y, Z], palette, grid };
    demos.set(kind, st); return st;
  }

  // ----- a jungle island with a beach, the sea and a wooden dock running out to the camera, made in code -----
  // The dock's deck is at y 9 (its top at 10), the sea at 8; it runs along z towards +z from the beach.
  function jungle() {
    const X = 96, Y = 44, Z = 84, grid = new Uint16Array(X * Y * Z), palette = [], ids = new Map();
    const id = (name, props = {}) => { const k = name + JSON.stringify(props); if (!ids.has(k)) { ids.set(k, palette.length); palette.push({ name, props }); } return ids.get(k) + 1; };
    const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z;
    const set = (x, y, z, name, props) => { if (inb(x, y, z)) grid[(y * Z + z) * X + x] = id(name, props); };
    const get = (x, y, z) => (inb(x, y, z) ? grid[(y * Z + z) * X + x] : 0);
    let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const SEA = 8, hx = 52, hz = 26;
    // the land: a hill rising from a beach, the sea floor shelving away from it
    const n2 = (x, z) => Math.sin(x * .21 + Math.sin(z * .13) * 1.7) * 1.3 + Math.sin(z * .17 + x * .05) * 1.1 + Math.sin((x - z) * .31) * .5;
    const heights = new Float32Array(X * Z);
    for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const d = Math.hypot((x - hx) * .9, (z - hz) * 1.15), hill = 24 * Math.exp(-(d * d) / (2 * 19 * 19)) + 9 * Math.exp(-((x - hx - 18) ** 2 + (z - hz + 2) ** 2) / 120);
      const shore = SEA + 3 - d * .085;
      heights[x + z * X] = Math.max(2, Math.max(hill + SEA - 2 + n2(x, z) * Math.min(1, hill / 6), shore + n2(x, z) * .4));
    }
    for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const h = Math.round(heights[x + z * X]);
      for (let y = 0; y <= h; y++) {
        const depth = h - y, beach = h <= SEA + 2;
        // sand terraces at the shore: sandstone steps under the sand
        let b = beach ? (depth < 2 ? 'sand' : 'sandstone') : depth === 0 ? (rnd() < .18 && h > SEA + 5 ? 'coarse_dirt' : 'grass_block') : depth < 4 ? 'dirt' : 'stone';
        if (!beach && depth === 0 && h < SEA + 4) b = rnd() < .5 ? 'sand' : 'grass_block';
        set(x, y, z, b);
      }
      for (let y = h + 1; y <= SEA; y++) set(x, y, z, 'water');
    }
    const ground = (x, z) => { for (let y = Y - 1; y >= 0; y--) { const v = get(x, y, z); if (v && palette[v - 1].name !== 'water' && !/leaves|log|vine|grass$|fern/.test(palette[v - 1].name)) return y; } return -1; };
    const dry = (x, z) => { const y = ground(x, z); return y >= SEA + 1 && palette[get(x, y, z) - 1]?.name === 'grass_block' ? y : -1; };
    // leaves in a round, flat pad, with vines hanging under its rim
    const pad = (cx, cy, cz, r, vines = .25) => {
      for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
        const d = Math.hypot(x - cx, z - cz); if (d > r + .3 || (d > r - .7 && rnd() < .35)) continue;
        if (!get(x, cy, z)) set(x, cy, z, 'jungle_leaves', { persistent: 'true' });
        if (d < r - 1.2 && !get(x, cy + 1, z) && rnd() < .7) set(x, cy + 1, z, 'jungle_leaves', { persistent: 'true' });
        if (d > r - 1.3 && rnd() < vines) { const len = 1 + Math.floor(rnd() * 6); for (let k = 1; k <= len; k++) if (!get(x, cy - k, z)) set(x, cy - k, z, 'vine'); else break; }
      }
    };
    // the great jungle trees: a two-by-two trunk, pads of leaves stacked up it
    const bigTree = (x, z) => { const y0 = dry(x, z); if (y0 < 0) return; const h = 20 + Math.floor(rnd() * 8);
      for (let y = y0 + 1; y <= y0 + h; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y, z + dz, 'jungle_log', { axis: 'y' });
      pad(x, y0 + h, z, 5, .35); for (let k = 0; k < 3; k++) { const yy = y0 + h - 5 - k * 4 - Math.floor(rnd() * 2), a = rnd() * 6.28, rr = 2 + Math.floor(rnd() * 2);
        const ox = Math.round(Math.cos(a) * 3), oz = Math.round(Math.sin(a) * 3); for (let j = 1; j <= 2; j++) set(x + Math.round(ox * j / 2), yy, z + Math.round(oz * j / 2), 'jungle_log', { axis: 'x' });
        pad(x + ox, yy + 1, z + oz, rr, .3); } };
    const smallTree = (x, z) => { const y0 = dry(x, z); if (y0 < 0 || get(x, y0 + 1, z)) return; const h = 4 + Math.floor(rnd() * 5);
      for (let y = y0 + 1; y <= y0 + h; y++) set(x, y, z, 'jungle_log', { axis: 'y' }); pad(x, y0 + h, z, 2 + Math.floor(rnd() * 2), .3); };
    // palms at the edge of the beach: a ringed trunk leaning out, fronds drooping from the top
    const palm = (x, z) => { const y0 = ground(x, z); if (y0 < SEA) return; const h = 6 + Math.floor(rnd() * 4), lean = rnd() < .5 ? -1 : 1;
      let tx = x; for (let y = y0 + 1; y <= y0 + h; y++) { if (y - y0 > h * .55 && rnd() < .5) tx += lean; set(tx, y, z, (y - y0) % 2 ? 'stripped_jungle_log' : 'jungle_log', { axis: 'y' }); }
      const top = y0 + h + 1; set(tx, top, z, 'jungle_leaves', { persistent: 'true' });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let k = 1; k <= 3; k++) set(tx + dx * k, top - (k > 2 ? 1 : 0), z + dz * k, 'jungle_leaves', { persistent: 'true' }); };
    for (let i = 0; i < 60; i++) { const x = 18 + Math.floor(rnd() * 70), z = 4 + Math.floor(rnd() * 40); if (Math.hypot(x - hx, z - hz) < 30) (rnd() < .3 ? bigTree : smallTree)(x, z); }
    bigTree(hx + 6, hz - 2); bigTree(hx - 10, hz + 4); bigTree(hx + 20, hz - 6);
    for (let i = 0; i < 40; i++) { const x = 4 + Math.floor(rnd() * 88), z = 10 + Math.floor(rnd() * 50), y = ground(x, z), n = palette[get(x, y, z) - 1]?.name;
      if (n === 'sand' && y >= SEA + 1 && y <= SEA + 3 && rnd() < .5) palm(x, z); }
    // ferns and bushes on the grass
    for (let i = 0; i < 400; i++) { const x = Math.floor(rnd() * X), z = Math.floor(rnd() * Z), y = dry(x, z); if (y > 0 && !get(x, y + 1, z)) set(x, y + 1, z, rnd() < .5 ? 'fern' : rnd() < .5 ? 'short_grass' : 'jungle_leaves', { persistent: 'true' }); }
    // the dock: a plank deck on log posts from the beach out over the sea, a rail track along it, posts at its edges
    const dx0 = 24, dx1 = 30, dz0 = 46, dz1 = 83, deck = SEA + 1;
    for (let z = dz0; z <= dz1; z++) for (let x = dx0; x <= dx1; x++) {
      set(x, deck, z, 'oak_planks');
      for (let y = deck + 1; y < deck + 4; y++) if (get(x, y, z) && /leaves|vine|fern|grass/.test(palette[get(x, y, z) - 1].name)) grid[(y * Z + z) * X + x] = 0;
      if ((x === dx0 || x === dx1) && z % 5 === 0) { for (let y = deck - 1; y >= 0; y--) { const v = get(x, y, z); if (v && palette[v - 1].name !== 'water') break; set(x, y, z, 'oak_log', { axis: 'y' }); }
        set(x, deck + 1, z, 'oak_fence'); }
    }
    for (let z = dz0; z <= dz1; z++) set(27, deck + 1, z, 'rail', { shape: 'north_south' });
    // a few crates and a barrel at the end of the dock
    set(dx1, deck + 1, 76, 'barrel'); set(dx1, deck + 1, 77, 'oak_planks'); set(dx1, deck + 2, 77, 'barrel');
    return { size: [X, Y, Z], palette, grid };
  }

  // ----- the parts -----
  const built = new Map();

  // ----- blocks that move, and redstone that moves them -----
  // A structure's "actions" are what is done to it over time: [{t, at: [x, y, z], do}] with a block's place in the
  // build and do "open" | "close" (doors, trapdoors, fence gates, chests), "on" | "off" (levers, lamps), "press"
  // (buttons, pressure plates), "extend" | "retract" (pistons) or "toggle". And power does the rest, as it would: a
  // lever that is on, a button or plate while pressed, a redstone torch or block, powers what touches it and the block
  // it is fixed to, and redstone dust carries power along itself (lit while it does); a door, trapdoor or gate with
  // power opens, a piston pushes, a lamp lights, and they go back when the power goes.
  const SWING = .25, STROKE = .15;
  const FACE = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
  const FIXED = /obsidian|bedrock|barrier|end_portal|command_block|structure_block|jigsaw|reinforced_deepslate/;
  const easeIO = v => v * v * (3 - 2 * v);
  const kindOf = n => /_door$/.test(n) ? 'door' : /_trapdoor$/.test(n) ? 'trapdoor' : /_fence_gate$/.test(n) ? 'gate' : n === 'lever' ? 'lever'
    : /_button$/.test(n) ? 'button' : /_pressure_plate$/.test(n) ? 'plate' : /^(sticky_)?piston$/.test(n) ? 'piston' : n === 'redstone_lamp' ? 'lamp'
    : /^(trapped_)?chest$|^ender_chest$/.test(n) ? 'chest' : n === 'redstone_wire' ? 'wire' : n === 'repeater' ? 'repeater' : n === 'comparator' ? 'comparator' : n === 'observer' ? 'observer' : null;
  const DIRECTED = new Set(['repeater', 'comparator', 'observer']);
  const RESPONDS = new Set(['door', 'trapdoor', 'gate', 'piston', 'lamp']);
  const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // what a lever or button is fixed to: the block behind it
  const backOf = m => { const p = m.b.props || {}; if (p.face === 'floor' || (m.kind === 'plate')) return [0, -1, 0]; if (p.face === 'ceiling') return [0, 1, 0];
    const f = FACE[p.facing] || FACE.north; return [-f[0], -f[1], -f[2]]; };
  function moversOf(st) {
    if (st._movers) return st._movers;
    const [X, Y, Z] = st.size, g = st.grid, pal = st.palette, list = [], skip = new Set(), pushable = new Map(), sources = [];
    const idx = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? -1 : (y * Z + z) * X + x);
    const blk = i => (i >= 0 && g[i] ? pal[g[i] - 1] : null), air = b => !b || AIR.test(b.name);
    for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const i = idx(x, y, z), b = blk(i); if (air(b)) continue; const n = b.name, p = b.props || {}, kind = kindOf(n);
      if (kind) { const m = { kind, x, y, z, b, i };
        if (kind === 'piston') Object.assign(m, { f: FACE[p.facing] || FACE.up, sticky: /sticky/.test(n), out: p.extended === 'true' });
        if (kind === 'button') m.hold = /stone|polished_blackstone/.test(n) ? 1 : 1.5;
        // repeaters and comparators take power in at the side they face and give it out the other; an observer
        // watches the block its face looks at and gives a pulse out of its back
        if (DIRECTED.has(kind)) { const f = FACE[p.facing] || FACE.north; m.back = [x + f[0], y + f[1], z + f[2]]; m.front = [x - f[0], y - f[1], z - f[2]];
          m.sides = f[0] ? [[x, y, z + 1], [x, y, z - 1]] : [[x + 1, y, z], [x - 1, y, z]];
          m.delay = kind === 'repeater' ? clamp(+p.delay || 1, 1, 4) * .1 : .1; m.subtract = p.mode === 'subtract'; }
        list.push(m); skip.add(i); }
      else if (/^piston_head$/.test(n)) skip.add(i);
      else if (/^redstone_(wall_)?torch$|^redstone_block$/.test(n)) sources.push([x, y, z]);
    }
    for (const m of list) if (m.kind === 'piston') for (let k = 1; k <= 14; k++) {
      const x = m.x + m.f[0] * k, y = m.y + m.f[1] * k, z = m.z + m.f[2] * k, i = idx(x, y, z), b = blk(i);
      if (i < 0) break; if (air(b) || /piston_head/.test(b.name) || skip.has(i) || FIXED.test(b.name)) continue;
      if (!pushable.has(i)) { const e = { kind: 'block', x, y, z, b, i }; pushable.set(i, e); list.push(e); skip.add(i); }
    }
    const byCell = new Map(list.filter(m => m.kind !== 'block').map(m => [m.i, m]));
    return st._movers = { list, skip, idx, X, Y, Z, blk, air, sources, byCell };
  }
  function staticMesh(st, key) {
    const k = key + '|still'; let m = built.get(k); if (!m) { m = build(st, moversOf(st).skip); built.set(k, m); } return m;
  }
  function blockMesh(b, shut = true) {
    const props = { ...(b.props || {}) }; if (shut && 'open' in props) props.open = 'false';
    const k = 'one|' + b.name + JSON.stringify(props); let m = built.get(k);
    if (!m) { m = build({ size: [1, 1, 1], palette: [{ name: b.name, props }], grid: new Uint16Array([1]) }); built.set(k, m); }
    return m.clone();
  }
  // a box of a block's look, A..B in the block (0..1), for the small parts things are made of
  function piece(name, a, b) {
    const m = blockMesh({ name, props: {} }); m.scale.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); m.position.set(...a);
    const g = new T.Group(); g.add(m); return g;
  }
  // turn a part made standing on the floor so its up points along DIR
  function aim(g, dir) { const [x, y, z] = dir; if (y === -1) g.rotation.x = Math.PI; else if (z) g.rotation.x = z * Math.PI / 2; else if (x) g.rotation.z = -x * Math.PI / 2; return g; }
  const woodOfName = n => (woodOf(n) || 'oak') + '_planks';

  // ----- what happens when: every action, every button letting go, and the power it all makes -----
  // Played through in time order, as the game plays it. Power has a strength, 0 to 15: a source gives 15, dust loses
  // one a block, a repeater gives out a full 15 a tenth of a second (or up to four tenths) after its input comes on or
  // goes off, a comparator gives out its back input if no side input is stronger (or, set to subtract, the back less
  // the strongest side) a tenth of a second later, and an observer gives a pulse a tenth of a second long, a tenth of a
  // second after the block it watches changes. What has power answers at once.
  function timeline(st, actions) {
    const mv = moversOf(st), key = JSON.stringify(actions); if (mv._tl?.key === key) return mv._tl;
    const comps = mv.list.filter(m => m.kind !== 'block'), on = new Map(), changes = new Map(), out = new Map();
    const doorBase = m => (m.kind === 'door' && m.b.props?.half === 'upper' ? mv.byCell.get(mv.idx(m.x, m.y - 1, m.z)) || m : m);
    const cell = c => mv.idx(c[0], c[1], c[2]);
    for (const m of comps) { const p = m.b.props || {};
      on.set(m, m.kind === 'piston' ? m.out : m.kind === 'lever' ? p.powered === 'true' : m.kind === 'lamp' ? p.lit === 'true' : DIRECTED.has(m.kind) ? p.powered === 'true' : p.open === 'true');
      if (DIRECTED.has(m.kind)) out.set(m, on.get(m) ? 15 : 0); changes.set(m, []); }
    const queue = [];
    for (const a of actions) { const m = mv.byCell.get(mv.idx(...a.at)); if (!m || m.kind === 'wire' || DIRECTED.has(m.kind)) continue; const tgt = doorBase(m);
      queue.push({ t: a.t, m: tgt, do: a.do });
      if (tgt.kind === 'button' || tgt.kind === 'plate') queue.push({ t: a.t + (tgt.hold || 1), m: tgt, do: 'release' }); }
    const pending = new Map();
    // the power everywhere, from what is on now
    const solve = () => {
      const all = new Map(), strong = new Map(), into = new Map();   // cell -> strength: from sources all round, strong blocks, aimed outputs
      const raise = (map, k, v) => { if (k >= 0 && v > (map.get(k) || 0)) map.set(k, v); };
      for (const c of mv.sources) raise(all, cell(c), 15);
      for (const m of comps) {
        if ((m.kind === 'lever' || m.kind === 'button' || m.kind === 'plate') && on.get(m)) { raise(all, m.i, 15); const [bx, by, bz] = backOf(m); raise(strong, mv.idx(m.x + bx, m.y + by, m.z + bz), 15); }
        if (DIRECTED.has(m.kind) && out.get(m) > 0) { const f = cell(m.front); raise(into, f, out.get(m)); if (!mv.byCell.has(f)) raise(strong, f, out.get(m)); }
      }
      // dust: lit from beside, from a strong block beside, or from an output aimed into it; one weaker a block
      const level = new Map(), q = [];
      for (const w of comps) if (w.kind === 'wire') {
        let v = into.get(w.i) || 0;
        for (const [dx, dy, dz] of SIX) { const k = mv.idx(w.x + dx, w.y + dy, w.z + dz); v = Math.max(v, all.get(k) || 0, strong.get(k) || 0); }
        if (v > 0) { level.set(w.i, v); q.push(w); } }
      while (q.length) { const w = q.shift(), v = level.get(w.i) - 1; if (v <= 0) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = mv.byCell.get(mv.idx(w.x + dx, w.y + dy, w.z + dz));
          if (n && n.kind === 'wire' && (level.get(n.i) || 0) < v) { level.set(n.i, v); q.push(n); } } }
      // how strong the power reaching cell C from the cell N beside it is
      const from = (n, c) => { const k = cell(n), ci = cell(c); const e = mv.byCell.get(k);
        if (e && DIRECTED.has(e.kind)) return cell(e.front) === ci ? out.get(e) || 0 : 0;
        return Math.max(all.get(k) || 0, strong.get(k) || 0, level.get(k) || 0); };
      const powered = c => SIX.some(([dx, dy, dz]) => from([c[0] + dx, c[1] + dy, c[2] + dz], c) > 0) || (strong.get(cell(c)) || 0) > 0 || (into.get(cell(c)) || 0) > 0;
      return { level, from, powered };
    };
    let steps = 0;
    const record = (m, v, t) => { if (v !== on.get(m)) { on.set(m, v); changes.get(m).push({ t, on: v }); return true; } return false; };
    const settle = (t, first) => {
      for (let pass = 0; pass < 4; pass++) {
        const { level, from, powered } = solve(); let moved = false;
        for (const m of comps) {
          if (m.kind === 'wire') { const v = (level.get(m.i) || 0) > 0; if (first) { if (v !== on.get(m)) moved = true; on.set(m, v); } else moved = record(m, v, t) || moved; continue; }
          if (DIRECTED.has(m.kind)) {
            if (m.kind === 'observer') continue;
            const here = [m.x, m.y, m.z], back = from(m.back, here), side = Math.max(...m.sides.map(c => from(c, here)));
            const want = m.kind === 'repeater' ? (back > 0 ? 15 : 0) : m.subtract ? Math.max(0, back - side) : back >= side ? back : 0;
            const was = pending.has(m) ? pending.get(m) : out.get(m);
            if (want !== was) { if (first) { out.set(m, want); on.set(m, want > 0); moved = true; } else { pending.set(m, want); queue.push({ t: Math.round((t + m.delay) * 1000) / 1000, m, set: want }); } }
            continue;
          }
          if (!RESPONDS.has(m.kind) || (m.kind === 'door' && m.b.props?.half === 'upper')) continue;
          const cells = [[m.x, m.y, m.z]]; if (m.kind === 'door') cells.push([m.x, m.y + 1, m.z]);
          const p = cells.some(powered), was = m._power ?? (first ? null : false);
          if (p !== was) { m._power = p; if (first && !p) continue; if (first) { on.set(m, p); moved = true; } else moved = record(m, p, t) || moved; }
        }
        if (!moved) break;
      }
    };
    // an observer sees a change in the block its face looks at
    const watch = (m, t) => { for (const o of comps) if (o.kind === 'observer' && cell(o.back) === m.i) {
      queue.push({ t: Math.round((t + .1) * 1000) / 1000, m: o, set: 15 }); queue.push({ t: Math.round((t + .2) * 1000) / 1000, m: o, set: 0 }); } };
    for (const m of comps) delete m._power;
    settle(0, true);
    const start = new Map([...on]);
    while (queue.length && steps++ < 4000) {
      queue.sort((a, b) => a.t - b.t); const t = queue[0].t; if (t > 3600) break;
      const before = new Map(comps.map(m => [m, changes.get(m).length]));
      while (queue.length && queue[0].t === t) { const e = queue.shift(), m = e.m;
        if (e.set != null) { if (pending.get(m) === e.set) pending.delete(m); if (out.get(m) !== e.set) { out.set(m, e.set); record(m, e.set > 0, t); } continue; }
        const cur = on.get(m), want = e.do === 'release' ? false : e.do === 'press' ? true : ['open', 'on', 'extend'].includes(e.do) ? true : ['close', 'off', 'retract'].includes(e.do) ? false : !cur;
        record(m, want, t); }
      settle(t, false);
      for (const m of comps) if (changes.get(m).length > before.get(m)) watch(m, t);
    }
    for (const m of comps) delete m._power;
    return mv._tl = { key, start, changes, doorBase };
  }
  // how far through (0 to 1) a part is at T, from where it started and its changes, each taking DUR
  function amountAt(list, t, start, dur) {
    let from = start ? 1 : 0, to = from, t0 = -1e9;
    const at = tt => from + (to - from) * easeIO(clamp((tt - t0) / dur, 0, 1));
    for (const c of list) { if (c.t > t) break; from = at(c.t); to = c.on ? 1 : 0; t0 = c.t; }
    return at(t);
  }
  // where every pushed block goes: the pistons' strokes played through in order
  function plan(st, tl) {
    const mv = moversOf(st); if (mv._plan?.tl === tl) return mv._plan;
    const where = new Map(), moves = new Map();
    for (const m of mv.list) if (m.kind === 'block') { where.set(m.i, m); moves.set(m, []); m.now = [m.x, m.y, m.z]; }
    const strokes = [];
    for (const m of mv.list) if (m.kind === 'piston') for (const c of tl.changes.get(m) || []) strokes.push({ ...c, m });
    strokes.sort((a, b) => a.t - b.t);
    const ok = new Map();
    for (const s of strokes) {
      const m = s.m, f = m.f, cell = (k, from = [m.x, m.y, m.z]) => mv.idx(from[0] + f[0] * k, from[1] + f[1] * k, from[2] + f[2] * k);
      if (s.on) {
        const line = []; let can = true;
        for (let k = 1; ; k++) { const i = cell(k); if (i < 0) { can = false; break; }
          const b = where.get(i); if (b) { line.push(b); if (line.length > 12) { can = false; break; } continue; }
          const sb = mv.blk(i); if (!mv.air(sb) && !mv.skip.has(i)) can = false; break; }
        ok.set(s, can); if (!can) continue;
        for (const b of line.reverse()) { const at0 = [...b.now], at1 = [at0[0] + f[0], at0[1] + f[1], at0[2] + f[2]];
          where.delete(mv.idx(...at0)); where.set(mv.idx(...at1), b); b.now = at1; moves.get(b).push({ t: s.t, from: at0, to: at1 }); }
      } else if (m.sticky) {
        const i = cell(2), b = where.get(i);
        if (b) { const at0 = [...b.now], at1 = [at0[0] - f[0], at0[1] - f[1], at0[2] - f[2]]; where.delete(i); where.set(mv.idx(...at1), b); b.now = at1; moves.get(b).push({ t: s.t, from: at0, to: at1 }); }
      }
    }
    for (const m of mv.list) if (m.kind === 'block') delete m.now;
    // a piston that could not push stays in: its stroke is taken out
    const pistonChanges = new Map();
    for (const m of mv.list) if (m.kind === 'piston') pistonChanges.set(m, []);
    for (const s of strokes) if (!s.on || ok.get(s)) pistonChanges.get(s.m).push({ t: s.t, on: s.on });
    return mv._plan = { tl, moves, pistonChanges };
  }
  const pivots = new Map();
  function doorPivot(m) {
    const k = m.kind + JSON.stringify(m.b.props || {}); if (pivots.has(k)) return pivots.get(k);
    const p = m.b.props || {}, f = (FACE[p.facing] || FACE.south), th = 3 / 16;
    let out;
    if (m.kind === 'door') {
      const h = p.hinge === 'left' ? 1 : -1, ax = -f[2] * h, az = f[0] * h, cx = .5 * (1 - f[0] - ax), cz = .5 * (1 - f[2] - az);
      const shutC = new T.Vector3(.5 - f[0] * (.5 - th / 2), .5, .5 - f[2] * (.5 - th / 2)), openC = new T.Vector3(.5 - ax * (.5 - th / 2), .5, .5 - az * (.5 - th / 2));
      let best = 1, bd = 1e9; for (const sgn of [1, -1]) {
        const v = shutC.clone().sub(new T.Vector3(cx, 0, cz)).applyMatrix4(new T.Matrix4().makeRotationY(sgn * Math.PI / 2)).add(new T.Vector3(cx, 0, cz));
        const d = v.distanceTo(openC); if (d < bd) { bd = d; best = sgn; } }
      out = { axis: 'y', sign: best, at: [cx, 0, cz] };
    } else {
      const top = p.half === 'top', ey = top ? 1 : 0, ex = .5 - f[0] * .5, ez = .5 - f[2] * .5, axis = f[0] ? 'z' : 'x';
      const c = new T.Vector3(.5, top ? 1 - th / 2 : th / 2, .5), pivot = new T.Vector3(f[0] ? ex : 0, ey, f[2] ? ez : 0);
      let best = 1, bd = 1e9;
      for (const sgn of [1, -1]) { const R = axis === 'x' ? new T.Matrix4().makeRotationX(sgn * Math.PI / 2) : new T.Matrix4().makeRotationZ(sgn * Math.PI / 2);
        const v = c.clone().sub(pivot).applyMatrix4(R).add(pivot); const inside = Math.abs(v.x - .5) + Math.abs(v.y - .5) + Math.abs(v.z - .5); if (inside < bd) { bd = inside; best = sgn; } }
      out = { axis, sign: best, at: [pivot.x, pivot.y, pivot.z] };
    }
    pivots.set(k, out); return out;
  }
  function pistonMesh(m) {
    const k = 'piston|' + m.sticky; let parts = built.get(k);
    if (!parts) { const one = name => build({ size: [1, 1, 1], palette: [{ name }], grid: new Uint16Array([1]) });
      parts = { body: one('cobblestone'), head: one(m.sticky ? 'slime_block' : 'oak_planks'), arm: one('stripped_oak_log') }; built.set(k, parts); }
    const g = new T.Group(), body = parts.body.clone(), head = parts.head.clone(), arm = parts.arm.clone();
    body.scale.set(1, .75, 1); body.position.set(-.5, -.5, -.5);
    head.scale.set(1, .25, 1); head.userData.base = .25; head.position.set(-.5, .25, -.5);
    arm.scale.set(.25, 1, .25); arm.position.set(-.125, .25, -.125); arm.visible = false;
    g.add(body, head, arm); g.userData = { head, arm };
    return aim(g, m.f);
  }
  // a fence gate: two halves, each turning on its post
  function gateMesh(m, open) {
    const p = m.b.props || {}, wood = woodOfName(m.b.name), g = new T.Group(), f = FACE[p.facing] || FACE.south, X = 1 / 16;
    // made spanning x, opening towards +z, then turned to its facing
    for (const side of [-1, 1]) {
      const half = new T.Group(), hinge = side < 0 ? 0 : 1;
      half.add(piece(wood, [side < 0 ? 0 : 1 - 2 * X, 5 * X, 7 * X], [side < 0 ? 2 * X : 1, 1, 9 * X]));
      const inner = new T.Group();
      for (const [y0, y1] of [[6 * X, 9 * X], [12 * X, 15 * X]]) inner.add(piece(wood, [side < 0 ? 2 * X : .5, y0, 7 * X], [side < 0 ? .5 : 1 - 2 * X, y1, 9 * X]));
      inner.add(piece(wood, [side < 0 ? 6 * X : .5 + 0 * X, 9 * X, 7 * X], [side < 0 ? .5 : 10 * X, 12 * X, 9 * X]));
      const pivot = new T.Group(); pivot.position.set(hinge, 0, .5); inner.position.set(-hinge, 0, -.5); pivot.add(inner);
      pivot.rotation.y = -side * open * Math.PI / 2; half.add(pivot); g.add(half);
    }
    const holder = new T.Group(); g.position.set(-.5, 0, -.5); holder.add(g);
    holder.rotation.y = f[0] ? -f[0] * Math.PI / 2 : f[2] < 0 ? Math.PI : 0;
    return holder;
  }
  // a lever: its base on the block it is fixed to, its handle thrown one way (off) or the other (on)
  function leverMesh(m, v) {
    const X = 1 / 16, g = new T.Group(), base = piece('cobblestone', [5 * X, 0, 4 * X], [11 * X, 3 * X, 12 * X]); g.add(base);
    const arm = new T.Group(); arm.add(piece('stripped_oak_log', [-X, 0, -X], [X, 10 * X, X])); const knob = piece('redstone_block', [-1.3 * X, 9 * X, -1.3 * X], [1.3 * X, 11 * X, 1.3 * X]);
    knob.visible = v > .5; arm.add(knob); arm.position.set(.5, 2 * X, .5); arm.rotation.x = (v * 2 - 1) * .7; g.add(arm);
    return place(g, m);
  }
  // a button, in when pressed
  function buttonMesh(m, v) {
    const X = 1 / 16, name = /stone|blackstone/.test(m.b.name) ? 'stone' : woodOfName(m.b.name);
    return place(piece(name, [5 * X, 0, 6 * X], [11 * X, (2 - v) * X, 10 * X]), m);
  }
  function plateMesh(m, v) {
    const X = 1 / 16, name = /light_weighted/.test(m.b.name) ? 'gold_block' : /heavy_weighted/.test(m.b.name) ? 'iron_block' : /stone|blackstone/.test(m.b.name) ? 'stone' : woodOfName(m.b.name);
    return piece(name, [X, 0, X], [15 * X, (1 - v * .5) * X, 15 * X]);
  }
  // stood on its face: the floor, the ceiling, or a wall it sticks out of
  function place(g, m) {
    const p = m.b.props || {};
    const up = p.face === 'ceiling' ? [0, -1, 0] : p.face === 'floor' ? [0, 1, 0] : p.face === 'wall' || (m.kind === 'button' && p.facing && !p.face) ? FACE[p.facing] || [0, 1, 0] : [0, 1, 0];
    // made standing on the floor of its block; turned about the block's middle so its base meets what it is fixed to
    const wrap = new T.Group(); g.position.set(-.5, -.5, -.5); wrap.add(g); aim(wrap, up); wrap.position.set(.5, .5, .5);
    const h = new T.Group(); h.add(wrap); return h;
  }
  // a repeater or comparator: a stone slab with little torches that light while it gives out power, a strip of dust
  // along it; an observer: a block with a face, its back lit red while it pulses
  function diodeMesh(m, v) {
    const X = 1 / 16, p = m.b.props || {}, f = FACE[p.facing] || FACE.north, g = new T.Group();
    g.add(piece('smooth_stone', [0, 0, 0], [1, 2 * X, 1]));
    const torch = (x, z, lit) => { g.add(piece('stripped_oak_log', [x - X, 2 * X, z - X], [x + X, 5 * X, z + X]));
      const t = new T.Mesh(new T.BoxGeometry(2.4 * X, 2 * X, 2.4 * X), lit ? dustMats.on : dustMats.off); t.position.set(x, 5.6 * X, z); g.add(t); };
    // made with its input at -z and its output at +z, then turned so the input is on the side it faces
    if (m.kind === 'repeater') { torch(.5, 4 * X, v > .5); torch(.5, (6 + 2 * clamp(+p.delay || 1, 1, 4)) * X, v > .5); }
    else { torch(4 * X, 4 * X, v > .5); torch(12 * X, 4 * X, v > .5); torch(.5, 13 * X, m.subtract); }
    const strip = new T.Mesh(new T.BoxGeometry(2 * X, .01, 10 * X), v > .5 ? dustMats.on : dustMats.off); strip.position.set(.5, 2 * X + .005, .5); g.add(strip);
    const holder = new T.Group(); g.position.set(-.5, 0, -.5); holder.add(g); holder.position.set(.5, 0, .5);
    // input (-z) towards its facing
    holder.rotation.y = f[0] ? -f[0] * Math.PI / 2 : f[2] > 0 ? Math.PI : 0; return holder;
  }
  function observerMesh(m, v) {
    const X = 1 / 16, p = m.b.props || {}, f = FACE[p.facing] || FACE.north, g = new T.Group();
    const body = piece('cobblestone', [0, 0, 0], [1, 1, 1]); body.position.set(-.5, -.5, -.5); g.add(body);
    // made looking along +z: two dark eyes on the face, a lamp on the back, red while it pulses
    const eye = new T.MeshStandardMaterial({ color: '#1a1a1c', roughness: .8 });
    for (const x of [-3.5 * X, 3.5 * X]) { const e = new T.Mesh(new T.BoxGeometry(3 * X, 3 * X, .02), eye); e.position.set(x, .1, .505); g.add(e); }
    const dot = new T.Mesh(new T.BoxGeometry(4 * X, 4 * X, .02), v > .5 ? dustMats.on : dustMats.off); dot.position.set(0, 0, -.505); g.add(dot);
    if (f[1]) g.rotation.x = -f[1] * Math.PI / 2; else g.rotation.y = f[0] ? f[0] * Math.PI / 2 : f[2] < 0 ? Math.PI : 0;
    const h = new T.Group(); g.position.set(.5, .5, .5); h.add(g); return h;
  }
  function lampMesh(m, v) { return blockMesh({ name: v > .5 ? 'redstone_lamp' : 'redstone_lamp_off', props: {} }); }
  // a chest: its body, and a lid that lifts on its back edge
  function chestMesh(m, v) {
    const X = 1 / 16, p = m.b.props || {}, f = FACE[p.facing] || FACE.south, wood = /ender/.test(m.b.name) ? 'obsidian' : 'oak_planks';
    // made facing +z (its latch at the front), the lid hinged along the back
    const g = new T.Group(); g.add(piece(wood, [X, 0, X], [15 * X, 10 * X, 15 * X]));
    const lid = new T.Group(); lid.add(piece(wood, [X, 0, 0], [15 * X, 4 * X, 14 * X])); lid.add(piece('gold_block', [7 * X, -2 * X, 13.6 * X], [9 * X, 2 * X, 14.6 * X]));
    lid.position.set(0, 10 * X, X); lid.rotation.x = -v * 1.35; g.add(lid);
    const holder = new T.Group(); g.position.set(-.5, 0, -.5); holder.add(g);
    holder.rotation.y = f[0] ? f[0] * Math.PI / 2 : f[2] < 0 ? Math.PI : 0; return holder;
  }
  // redstone dust: a dot, and an arm to each neighbour it joins, dull red, glowing while it carries power
  const dustMats = { off: new T.MeshStandardMaterial({ color: '#5a0d08', roughness: .9 }), on: new T.MeshStandardMaterial({ color: '#ff3a24', emissive: new T.Color('#ff2a12'), emissiveIntensity: 1.4, roughness: .7 }) };
  function wireMesh(mv, m, v) {
    const X = 1 / 16, g = new T.Group(), mat = v > .5 ? dustMats.on : dustMats.off, flat = (x0, z0, x1, z1) => { const q = new T.Mesh(new T.BoxGeometry(x1 - x0, .02, z1 - z0), mat); q.position.set((x0 + x1) / 2, .015, (z0 + z1) / 2); g.add(q); };
    flat(5 * X, 5 * X, 11 * X, 11 * X);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const joins = [0, 1, -1].some(dy => { const n = mv.byCell.get(mv.idx(m.x + dx, m.y + dy, m.z + dz)); return n && (n.kind === 'wire' || dy === 0); })
        || mv.sources.some(([x, y, z]) => x === m.x + dx && y === m.y && z === m.z + dz);
      if (joins) flat(dx > 0 ? 11 * X : dx < 0 ? 0 : 6 * X, dz > 0 ? 11 * X : dz < 0 ? 0 : 6 * X, dx > 0 ? 1 : dx < 0 ? 5 * X : 10 * X, dz > 0 ? 1 : dz < 0 ? 5 * X : 10 * X);
    }
    return g;
  }
  function movingParts(st, P, t) {
    const mv = moversOf(st), acts = (Array.isArray(P.actions) ? P.actions : []).filter(a => a && Array.isArray(a.at) && isFinite(+a.t))
      .map(a => ({ t: +a.t, at: a.at.map(Number), do: a.do || 'toggle' })).sort((a, b) => a.t - b.t);
    const tl = timeline(st, acts), pl = plan(st, tl), g = new T.Group();
    const amt = (m, dur) => { const b = tl.doorBase(m); return amountAt((b.kind === 'piston' ? pl.pistonChanges.get(b) : tl.changes.get(b)) || [], t, tl.start.get(b), dur); };
    for (const m of mv.list) {
      let part = null;
      if (m.kind === 'door' || m.kind === 'trapdoor') {
        const open = amt(m, SWING), pv = doorPivot(m);
        part = new T.Group(); const mesh = blockMesh(m.b); mesh.position.set(-pv.at[0], -pv.at[1], -pv.at[2]); part.add(mesh);
        part.position.set(m.x + pv.at[0], m.y + pv.at[1], m.z + pv.at[2]); part.rotation[pv.axis] = pv.sign * open * Math.PI / 2; g.add(part); continue;
      }
      if (m.kind === 'piston') {
        const pm = pistonMesh(m), e = amt(m, STROKE), { head, arm } = pm.userData;
        head.position.y = head.userData.base + e; arm.visible = e > .01; arm.scale.y = Math.max(.001, e);
        pm.position.set(m.x + .5, m.y + .5, m.z + .5); g.add(pm); continue;
      }
      if (m.kind === 'block') {
        const mesh = blockMesh(m.b, false); let p = [m.x, m.y, m.z];
        for (const mo of pl.moves.get(m) || []) { if (mo.t > t) break; const f = easeIO(clamp((t - mo.t) / STROKE, 0, 1)); p = mo.from.map((v, i) => v + (mo.to[i] - v) * f); }
        mesh.position.set(...p); g.add(mesh); continue;
      }
      const v = amt(m, m.kind === 'button' || m.kind === 'plate' ? .08 : m.kind === 'lever' ? .12 : m.kind === 'chest' ? .35 : DIRECTED.has(m.kind) ? .01 : .05);
      part = m.kind === 'repeater' || m.kind === 'comparator' ? diodeMesh(m, v) : m.kind === 'observer' ? observerMesh(m, v) : m.kind === 'gate' ? (() => { const h = gateMesh(m, v); h.position.set(.5, 0, .5); return h; })() : m.kind === 'lever' ? leverMesh(m, v) : m.kind === 'button' ? buttonMesh(m, v)
        : m.kind === 'plate' ? plateMesh(m, v) : m.kind === 'lamp' ? lampMesh(m, v) : m.kind === 'chest' ? (() => { const h = chestMesh(m, v); h.position.set(.5, 0, .5); return h; })() : m.kind === 'wire' ? wireMesh(mv, m, v) : null;
      if (!part) continue;
      const holder = new T.Group(); holder.add(part); holder.position.set(m.x, m.y, m.z); g.add(holder);
    }
    return g;
  }

  World.custom.structure = (P, t) => {
    const st = structureOf(P); const g = new T.Group(); g.scale.setScalar(M * clamp(num(P.block, 1), .01, 100));
    if (!st) return g;
    const key = P.demo || P.asset || 'cottage';
    const inst = staticMesh(st, key).clone(); inst.children.forEach(c => { if (c.isPointLight) c.visible = P.lamps !== false; });
    inst.add(movingParts(st, P, t));
    // stood on its middle, its lowest blocks on the ground (or lifted by Lift)
    const [X, , Z] = st.size; inst.position.set(-X / 2, -num(P.sink, 0), -Z / 2);
    g.add(inst); return g;
  };

  // drifting square clouds: a flat layer of puffs on a grid, each a box, sides hidden where they touch
  World.custom.blockclouds = (P, t) => {
    const cell = clamp(num(P.cell, 12), 1, 100), thick = clamp(num(P.thick, 4), .2, 50), cover = clamp(num(P.cover, 40), 0, 100) / 100, n = 48;
    const key = ['cl', cell, thick, cover, P.seed || 1].join('|');
    let geo = built.get(key);
    if (!geo) {
      const seed = num(P.seed, 1), on = (x, z) => { x = (x + n) % n; z = (z + n) % n;
        // a smooth noise, thresholded: puffs of a few cells, holes between
        const f = (a, b, s) => { const ix = Math.floor(a), iz = Math.floor(b), fx = a - ix, fz = b - iz, h = (i, j) => hash(((i % (n / s)) + n / s) % (n / s), ((j % (n / s)) + n / s) % (n / s), seed * 13 + s);
          const sm = v => v * v * (3 - 2 * v); return (h(ix, iz) * (1 - sm(fx)) + h(ix + 1, iz) * sm(fx)) * (1 - sm(fz)) + (h(ix, iz + 1) * (1 - sm(fx)) + h(ix + 1, iz + 1) * sm(fx)) * sm(fz); };
        return f(x / 6, z / 6, 6) * .7 + f(x / 3, z / 3, 3) * .3 > 1 - cover * .75; };
      const pos = [], nor = [], idx = [];
      const quad = (pts, nn) => { const b = pos.length / 3; for (const p of pts) pos.push(...p); for (let i = 0; i < 4; i++) nor.push(...nn); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        if (!on(x, z)) continue; const a = [x * cell, 0, z * cell], b = [(x + 1) * cell, thick, (z + 1) * cell];
        quad([[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]], [0, 1, 0]);
        quad([[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]], [0, -1, 0]);
        if (!on(x + 1, z)) quad([[b[0], a[1], b[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]]], [1, 0, 0]);
        if (!on(x - 1, z)) quad([[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]], [-1, 0, 0]);
        if (!on(x, z + 1)) quad([[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], [0, 0, 1]);
        if (!on(x, z - 1)) quad([[b[0], a[1], a[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]]], [0, 0, -1]);
      }
      geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setIndex(pos.length / 3 > 65535 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      built.set(key, geo);
    }
    const mkey = 'clm' + (P.color || '#ffffff') + num(P.opacity, 85);
    let mat = built.get(mkey);
    if (!mat) { mat = new T.MeshStandardMaterial({ color: new T.Color(P.color || '#ffffff'), roughness: 1, transparent: true, opacity: clamp(num(P.opacity, 85), 5, 100) / 100,
      emissive: new T.Color(P.color || '#ffffff'), emissiveIntensity: .35, depthWrite: true }); built.set(mkey, mat); }
    const span = cell * n, drift = ((num(P.speed, 2) * t) % span + span) % span;
    const g = new T.Group();
    // two copies side by side, so the layer drifts on forever with no gap
    for (const k of [-1, 0]) { const m = new T.Mesh(geo, mat); m.position.set(-span / 2 + drift + k * span, num(P.height, 110) - (+P.at?.[1] || 0), -span / 2); m.castShadow = P.shadows === true; m.receiveShadow = false; g.add(m); }
    g.scale.setScalar(M); g.userData.blockClouds = true; return g;
  };

  // the square sun and moon: flat squares far off, where the world's sun is and opposite it
  function bodyTex(kind, phase) {
    const key = 'body' + kind + phase; if (built.has(key)) return built.get(key);
    const S = 32, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    if (kind === 'sun') {
      g.fillStyle = 'rgba(255,236,170,.35)'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff6c8'; g.fillRect(4, 4, S - 8, S - 8); g.fillStyle = '#ffffff'; g.fillRect(8, 8, S - 16, S - 16);
    } else {
      g.fillStyle = '#dfe3ee'; g.fillRect(4, 4, S - 8, S - 8);
      g.fillStyle = '#aeb4c6'; for (const [x, y, w] of [[9, 9, 5], [18, 7, 3], [16, 17, 6], [8, 20, 3], [22, 22, 3]]) g.fillRect(x, y, w, w);
      // the dark part of the moon, by its phase (0 full .. 4 new .. 7)
      const p = ((+phase || 0) % 8 + 8) % 8, dark = p <= 4 ? p / 4 : (8 - p) / 4, w = Math.round((S - 8) * dark);
      // the unlit part lets the sky through, as the moon does by day (and at night it is all but black)
      if (p <= 4) g.clearRect(S - 4 - w, 4, w, S - 8); else g.clearRect(4, 4, w, S - 8);
    }
    const tex = new T.CanvasTexture(cv); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.colorSpace = T.SRGBColorSpace; built.set(key, tex); return tex;
  }
  World.custom.skybodies = P => {
    const g = new T.Group();
    for (const kind of ['sun', 'moon']) {
      if (P[kind] === false) continue;
      const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: bodyTex(kind, P.phase), transparent: true, fog: false, depthWrite: false, toneMapped: false,
        color: new T.Color(kind === 'sun' ? '#ffffff' : '#ffffff').multiplyScalar(kind === 'sun' ? clamp(num(P.glow, 300), 0, 2000) / 100 : 1.1) }));
      m.renderOrder = -5; m.userData.skyBody = kind;
      if (kind === 'moon' && P.moonEl !== undefined && P.moonEl !== '' && P.moonEl !== null) m.userData.at = [num(P.moonEl, 20), num(P.moonAz, 0)]; m.userData.size = clamp(num(kind === 'sun' ? P.sunSize : P.moonSize, kind === 'sun' ? 7 : 6), .2, 60); m.frustumCulled = false;
      g.add(m);
    }
    return g;
  };
  // each frame: put the sun where the world's sun is and the moon opposite, far off and facing the camera
  World.stageHooks.push(({ B, o, cam }) => {
    if (!B.props) return;
    const deg = v => (+v || 0) * Math.PI / 180, e = deg(clamp(+o.sunEl, -90, 90)), a = deg(o.sunAz);
    const sun = new T.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
    const far = 1500 * M, inv = new T.Matrix4();
    B.props.traverse(n => {
      if (!n.userData.skyBody) return;
      // the moon is opposite the sun, unless it is placed itself (a moon by day)
      const own = n.userData.skyBody === 'moon' && n.userData.at;
      const dir = n.userData.skyBody === 'sun' ? sun : own ? new T.Vector3(Math.sin(deg(own[1])) * Math.cos(deg(own[0])), Math.sin(deg(own[0])), -Math.cos(deg(own[1])) * Math.cos(deg(own[0]))) : sun.clone().negate();
      const world = cam.position.clone().addScaledVector(dir, far);
      n.parent.updateMatrixWorld(true); inv.copy(n.parent.matrixWorld).invert();
      n.position.copy(world.applyMatrix4(inv));
      const side = 2 * far * Math.tan(deg(n.userData.size) / 2), sc = new T.Vector3(); n.parent.getWorldScale(sc);
      n.scale.set(side / sc.x, side / sc.y, 1);
      n.quaternion.copy(cam.quaternion); const pq = new T.Quaternion(); n.parent.getWorldQuaternion(pq); n.quaternion.premultiply(pq.invert());
      n.visible = dir.y > -.08;
    });
  });

  World.PARTS.push('structure', 'blockclouds', 'skybodies');
  SceneEd.add('structure', { type: 'structure', demo: 'cottage', block: 1 }, 'Block build');
  SceneEd.add('blockclouds', { type: 'blockclouds', height: 110, cell: 12, thick: 4, cover: 40, speed: 2, opacity: 85 }, 'Square clouds');
  SceneEd.add('skybodies', { type: 'skybodies', sunSize: 7, moonSize: 6, phase: 0, glow: 300 }, 'Square sun and moon');
  SceneEd.extras.push({
    inspector(P) {
      const n = (k, label, v, step = 1) => `<label class="f"><span>${label}</span><input type="number" step="${step}" data-k="${k}" value="${v}"></label>`;
      if (P.type === 'structure') {
        const builds = Object.entries((typeof S !== 'undefined' && S.assets) || {}).filter(([, a]) => a.kind === 'structure');
        const Q = resolve(P), cur = Q.asset ? Q.asset : 'demo:' + Q.demo;
        const a = Q.asset ? S.assets[Q.asset] : null;
        return `<div class="hd">Block build</div>
          <label class="f wide"><span>Build</span><select data-k="build">${[['demo:cottage', 'The cottage (built in)'], ['demo:jungle', 'Jungle island and dock (built in)'], ...builds.map(([id, b]) => [id, b.name])].map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          ${n('block', 'Block size m', num(P.block, 1), .1)}${n('sink', 'Sink blocks', num(P.sink, 0), 1)}
          <p class="note">${a ? `${a.size.join(' × ')} blocks, ${a.blocks.toLocaleString()} placed, ${a.kinds} kinds. ` : ''}Import a structure block's .nbt file (or a .schem) under Import, or drop it on the viewport, and pick it here. Blocks are drawn with Riptide's own pixel pictures, by what each is made of.</p>
          ${moversPanel(P, Q)}`;
      }
      if (P.type === 'blockclouds') return `<div class="hd">Square clouds</div>${n('height', 'Height m', num(P.height, 110))}${n('cover', 'Cover %', num(P.cover, 40))}${n('cell', 'Square m', num(P.cell, 12))}
        ${n('thick', 'Thickness m', num(P.thick, 4), .5)}${n('speed', 'Drift m/s', num(P.speed, 2), .5)}${n('opacity', 'Opacity %', num(P.opacity, 85))}${n('seed', 'Pattern', num(P.seed, 1))}
        <label class="f"><span>Colour</span><input type="color" data-k="color" value="${P.color || '#ffffff'}"></label>`;
      if (P.type === 'skybodies') return `<div class="hd">Square sun and moon</div>${n('sunSize', 'Sun size°', num(P.sunSize, 7), .5)}${n('moonSize', 'Moon size°', num(P.moonSize, 6), .5)}
        ${n('phase', 'Moon phase (0 full, 4 new)', num(P.phase, 0))}${n('glow', 'Sun glow %', num(P.glow, 300), 10)}
        <label class="f"><span>Moon height°</span><input type="number" data-k="moonEl" value="${P.moonEl ?? ''}" placeholder="opposite the sun"></label>
        <label class="f"><span>Moon around°</span><input type="number" data-k="moonAz" value="${P.moonAz ?? ''}" placeholder="opposite the sun"></label>
        <p class="note">The sun sits where the world's sun is (World: Sun height and Sun around) and the moon opposite it, unless you place the moon yourself: lower the sun below the horizon for night.</p>`;
      return '';
    },
  });
  // the inspector's Build select: a built-in build (demo:...), or an imported one (its asset id)
  function resolve(P) {
    const b = P.build;
    if (b) return String(b).startsWith('demo:') ? { ...P, demo: String(b).slice(5), asset: '' } : { ...P, asset: b, demo: '' };
    return P.asset ? { ...P, demo: '' } : { ...P, demo: P.demo || 'cottage' };
  }
  const was = World.custom.structure;
  World.custom.structure = (P, t) => was(resolve(P), t);

  // the moving blocks of the selected build, each with a button that makes it move at the playhead, and what is
  // already set to happen, each with a button to take it out
  const NAMES = { door: 'Door', trapdoor: 'Trapdoor', piston: 'Piston', gate: 'Fence gate', lever: 'Lever', button: 'Button', plate: 'Pressure plate', lamp: 'Lamp', chest: 'Chest' };
  function moversPanel(P, Q) {
    const st = structureOf(Q); if (!st) return '';
    const mv = moversOf(st), list = mv.list.filter(m => m.kind !== 'block' && m.kind !== 'wire' && !DIRECTED.has(m.kind) && !(m.kind === 'door' && m.b.props?.half === 'upper'));
    if (!list.length) return '<p class="note">Nothing here to work by hand: no doors, gates, trapdoors, levers, buttons, plates, pistons, lamps or chests.</p>';
    const acts = Array.isArray(P.actions) ? P.actions : [], esc = v => String(v).replace(/[<>&"]/g, '');
    const label = m => `${m.kind === 'piston' && m.sticky ? 'Sticky piston' : NAMES[m.kind]} ${m.x}, ${m.y}, ${m.z}`;
    const rows = list.slice(0, 60).map(m => {
      const verbs = m.kind === 'piston' ? [['extend', 'Push'], ['retract', 'Pull']] : m.kind === 'lever' || m.kind === 'lamp' ? [['on', 'On'], ['off', 'Off']]
        : m.kind === 'button' || m.kind === 'plate' ? [['press', 'Press']] : [['open', 'Open'], ['close', 'Shut']];
      return `<div class="mv-row"><span>${esc(label(m))}</span>${verbs.map(([d, l]) => `<button class="tb small" data-bact="${m.x},${m.y},${m.z},${d}" title="${l} it at the playhead">${l}</button>`).join('')}</div>`;
    }).join('');
    const done = acts.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t).map(({ a, i }) =>
      `<div class="mv-row"><span>${(+a.t).toFixed(2)} s · ${esc(a.do || 'toggle')} ${esc((a.at || []).join(', '))}</span><button class="tb small" data-bdel="${i}" title="Take this out">×</button></div>`).join('');
    return `<div class="hd">Moving blocks</div><p class="note">Put the playhead where it should happen, then press. Doors, gates and trapdoors swing; pistons push the blocks ahead of them (up to twelve) and sticky ones pull one back; chests open. Redstone works: a lever, a pressed button or plate, a redstone torch or block powers what touches it and what it is fixed to, dust carries the power, and doors, gates, trapdoors, pistons and lamps with power open, push or light.</p>
      ${rows}${list.length > 60 ? `<p class="note">And ${list.length - 60} more.</p>` : ''}${done ? '<div class="hd">Happens</div>' + done : ''}`;
  }
  SceneEd.extras.push({
    click(b) {
      const P = SceneEd.selected; if (!P || P.type !== 'structure') return false;
      if (b.dataset.bact) { const [x, y, z, d] = b.dataset.bact.split(','); P.actions ||= [];
        P.actions.push({ t: Math.round(SceneEd.time * 100) / 100, at: [+x, +y, +z], do: d }); P.actions.sort((p, q) => p.t - q.t);
        SceneEd.record(); return true; }
      if (b.dataset.bdel != null) { (P.actions || []).splice(+b.dataset.bdel, 1); if (!P.actions?.length) delete P.actions; SceneEd.record(); return true; }
      return false;
    },
  });

  // ----- the scene: a cottage on a floating island, square clouds, the sun and moon, a figure waving -----
  World.PRESETS.blocks = { label: 'Block world', hint: 'A block build on a floating island under square clouds, a square sun and moon, and a block figure to pose',
    p: { sky: 'day', sunEl: 34, sunAz: 150, sunPower: 110, clouds: 0, wind: 0, ground: 'none', fog: 6, dust: 0, eye: 0, heading: 0, pitch: 0, travel: 0,
      lens: 35, focus: 0, dof: 0, exposure: 0, bloom: 22, grain: 6, fringe: 2, ao: 40, streaks: 0, flare: 0, godrays: 0, letterbox: 'none', render: 'preview' },
    objects: () => [
      { type: 'structure', name: 'Cottage', at: [0, -11, 0], demo: 'cottage', block: 1 },
      { type: 'blockclouds', name: 'Clouds', at: [0, 0, 0], height: 34, cell: 8, thick: 2, cover: 42, speed: 1.5, opacity: 88 },
      // the sun lights the cottage's front from behind the camera; a pale moon by day hangs over the island
      { type: 'skybodies', name: 'Sun and moon', at: [0, 0, 0], sunSize: 8, moonSize: 6, phase: 2, glow: 320, moonEl: 9, moonAz: -24 },
      { type: 'blocky', name: 'Figure', at: [5.2, 0, 6.2], turn: [0, 30, 0], move: 'wave', height: 1.8, pose: { Head: [-8, 10, 0] } },
      { type: 'camera', id: 'cam', name: 'Camera', at: [15, 5, 22], turn: [-9, 34, 0], lens: 28 },
    ],
    shots: [{ t: 0, cam: 'cam' }] };

  // ----- the scene: a jungle island, two figures in uniform on a dock, filmed from the end of it -----
  // The build stands so its sea (block water, hidden under the world's calm sea) meets the world's water line, and
  // the dock's deck is 1.1 m above it, where the figures stand.
  const DECK = 1.1;
  World.PRESETS.blockisle = { label: 'Block island', hint: 'A jungle island, a beach and a wooden dock in a calm sea, two block figures in uniform talking on the dock',
    p: { sky: 'day', sunEl: 48, sunAz: -35, sunPower: 115, clouds: 18, wind: 2, ground: 'ocean', water: '#1f7fae', waves: .05, chop: 12, swell: 0, fog: 3, dust: 0,
      eye: 0, heading: 0, pitch: 0, travel: 0, lens: 30, focus: 0, dof: 0, exposure: .4, bloom: 14, grain: 4, fringe: 2, ao: 30, streaks: 0, flare: 0, godrays: 0, letterbox: 'none', render: 'preview' },
    objects: () => [
      { type: 'structure', name: 'Jungle island', at: [20.5, DECK - 10, -30.5], build: 'demo:jungle', block: 1 },
      { type: 'blocky', name: 'Officer', at: [-.95, DECK, -.2], turn: [0, 70, 0], move: 'talk', height: 1.8, skinTone: '#d9a882', hair: '#2a1d12',
        shirt: '#4e6b30', pants: '#425c28', shoes: '#1f1a14', belt: '#3a2a18', hat: 'cap', hatColor: '#3f5a26' },
      { type: 'blocky', name: 'Soldier', at: [1.15, DECK, -1.6], turn: [0, -60, 0], move: 'idle', height: 1.8, skinTone: '#e6b98f', hair: '#5a3b1e',
        shirt: '#5a7536', pants: '#4a6330', shoes: '#1f1a14', belt: '#3a2a18', hat: 'cap', hatColor: '#4a6530', hold: 'sword', holdMat: 'iron', pose: { Head: [-4, -12, 0] } },
      { type: 'camera', id: 'cam', name: 'Camera', at: [.2, DECK + 1.5, 4.2], turn: [-6, -8, 0], lens: 32 },
    ],
    shots: [{ t: 0, cam: 'cam' }] };

  return { readNBT, read, importFile, lookOf, build, demo, pack, unpack, fromStructure, fromSchem, gunzip };
})();
