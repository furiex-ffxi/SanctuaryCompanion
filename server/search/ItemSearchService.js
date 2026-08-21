import fs from 'node:fs'
import path from 'node:path'
import { getSearchableItemAttributes, projectVaultEntry } from '../vault/vaultProjection.js'

const tokens = value => String(value || '').toLowerCase().split(/[^a-z0-9%+]+/).filter(Boolean)
export function getItemQueryMatch(item, query) {
  const p = projectVaultEntry({ itemData: item }), wanted = tokens(query)
  if (!wanted.length) return null
  const candidates = [
    { rank: 0, field: 'Name', text: p.displayName },
    { rank: 1, field: 'Set', text: item.set_name },
    { rank: 1, field: 'Unique name', text: item.unique_name },
    { rank: 1, field: 'Runeword', text: item.given_runeword_name || item.runeword_name },
    { rank: 2, field: 'Base type', text: [item.type_name, p.typeName].filter(Boolean).join(' ') },
    ...getSearchableItemAttributes(item).map(value => ({ rank: 3, field: 'Stat', text: value })),
    { rank: 4, field: 'Category', text: `${p.slot} ${p.category}` },
    { rank: 5, field: 'Type code', text: item.type },
  ].filter(candidate => candidate.text)
  const contains = (candidate, part) => tokens(candidate.text).some(word => word.startsWith(part))
  const single = candidates.find(candidate => wanted.every(part => contains(candidate, part)))
  if (single) return { rank: single.rank, field: single.field, text: single.text }
  const selected = wanted.map(part => candidates.find(candidate => contains(candidate, part)))
  if (selected.some(candidate => !candidate)) return null
  return { rank: Math.max(...selected.map(candidate => candidate.rank)), field: [...new Set(selected.map(candidate => candidate.field))].join(' + '), text: [...new Set(selected.map(candidate => candidate.text))].join(' · ') }
}
export const matchesItemQuery = (item, query) => Boolean(getItemQueryMatch(item, query))
const seed = item => item?.id ?? null
function walk(items, context, out = [], parent = null) {
  for (const [index, item] of (items || []).entries()) {
    out.push({ ...context, item, parentSeed: seed(parent), socketIndex: parent ? index : null })
    walk(item.contained_items, { ...context, location: 'contained' }, out, item)
  }
  return out
}
function location(item) {
  if (+item.location_id === 1) return 'equipment'
  if (+item.alt_position_id === 1) return 'inventory'
  if (+item.alt_position_id === 5) return 'stash'
  return String(item.type).trim() === 'box' ? 'cube' : 'unknown'
}
export class ItemSearchService {
  constructor(options) { Object.assign(this, options); this.cache = new Map() }
  async parse(file, parser) {
    const stat = fs.statSync(file), key = `${file}:${stat.size}:${stat.mtimeMs}`
    if (!this.cache.has(key)) this.cache.set(key, Promise.resolve().then(() => parser(file)).catch(e => { this.cache.delete(key); throw e }))
    for (const old of this.cache.keys()) if (old.startsWith(`${file}:`) && old !== key) this.cache.delete(old)
    return this.cache.get(key)
  }
  result(row) {
    const preview = projectVaultEntry({ itemData: row.item })
    const identity = { sourceKind: row.sourceKind, filename: row.filename, fileSize: row.fileSize, fileMtimeMs: row.fileMtimeMs, itemSeed: seed(row.item), location: row.location, parentSeed: row.parentSeed, socketIndex: row.socketIndex, vaultId: row.vaultId }
    return { ...identity, identity, match: row.match, characterName: row.characterName, pageIndex: row.pageIndex, position: { x: row.item.position_x ?? null, y: row.item.position_y ?? null, equippedId: row.item.equipped_id ?? null, altPositionId: row.item.alt_position_id ?? null }, preview: { ...preview, item: row.item }, navigation: { mainTab: row.sourceKind === 'infiniteStash' ? 'stash' : row.sourceKind === 'sharedStash' ? 'shared_stash' : 'character', subTab: ['inventory','stash','cube'].includes(row.location) ? row.location : 'inventory', filename: row.filename, pageIndex: row.pageIndex, vaultId: row.vaultId } }
  }
  async search({ q, sharedFile, limit = 10 }) {
    const query = String(q || '').trim().toLowerCase(), cap = Math.min(Math.max(+limit || 10, 1), 50), errors = [], characters = [], sharedStash = []
    if (query.length < 2) throw Error('Search query must contain at least 2 characters')
    const saves = fs.existsSync(this.savesDir) ? fs.readdirSync(this.savesDir).filter(f => f.toLowerCase().endsWith('.d2s')) : []
    await Promise.all(saves.map(async filename => { const file = path.join(this.savesDir, filename); try { const stat = fs.statSync(file), save = await this.parse(file, this.parseD2S), sets = [[save.items,'character'],[save.contained_items,'contained'],[save.merc_items,'mercenary'],[save.corpse_items,'corpse'],[save.iron_golem_item?[save.iron_golem_item]:[],'iron-golem']]; for (const [items,kind] of sets) for (const row of walk(items,{sourceKind:'character',filename,characterName:save.name,fileSize:stat.size,fileMtimeMs:stat.mtimeMs,location:kind})) { if(row.location==='character')row.location=location(row.item); const match=getItemQueryMatch(row.item,query); if(match)characters.push(this.result({...row,match})) } } catch(e) { errors.push({sourceKind:'character',filename,error:e.message}) } }))
    if (sharedFile) { if (path.basename(sharedFile)!==sharedFile || path.extname(sharedFile).toLowerCase()!=='.d2i') errors.push({sourceKind:'sharedStash',filename:sharedFile,error:'sharedFile must be a .d2i basename'}); else { const file=path.join(this.savesDir,sharedFile); try { const stat=fs.statSync(file), stash=await this.parse(file,this.parseD2I); for(const [pageIndex,page] of (stash.pages||[]).entries())for(const row of walk(page.items,{sourceKind:'sharedStash',filename:sharedFile,fileSize:stat.size,fileMtimeMs:stat.mtimeMs,location:'shared-stash',pageIndex})){const match=getItemQueryMatch(row.item,query);if(match)sharedStash.push(this.result({...row,match}))} } catch(e){errors.push({sourceKind:'sharedStash',filename:sharedFile,error:e.message})} } }
    const infiniteStashRows = []
    let vaultCursor = null
    do {
      const page = this.repository.list({ q: query, limit: 200, cursor: vaultCursor, statuses: ['active', 'pending_deposit', 'pending_withdraw'] })
      infiniteStashRows.push(...page.items)
      vaultCursor = page.nextCursor
    } while (vaultCursor)
    const infiniteStash=infiniteStashRows.map(e=>({entry:e,match:getItemQueryMatch(e.itemData,query)})).filter(x=>x.match).map(({entry:e,match})=>this.result({sourceKind:'infiniteStash',filename:e.sourceSave,location:'vault',vaultId:e.vaultId,item:e.itemData,match}))
    const group = rows => { const ranked=rows.sort((a,b)=>a.match.rank-b.match.rank||a.preview.displayName.localeCompare(b.preview.displayName)); return {results:ranked.slice(0,cap),total:ranked.length} }
    return {query,groups:{characters:group(characters),sharedStash:group(sharedStash),infiniteStash:group(infiniteStash)},errors,nextCursor:null}
  }
}
export function registerItemSearchRoute(server, options) { const service=new ItemSearchService(options); server.middlewares.use('/__item_search',async(req,res)=>{if(req.method!=='GET'){res.writeHead(405);return res.end()}try{const u=new URL(req.url,'http://localhost'),body=await service.search(Object.fromEntries(u.searchParams));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}))}});return service }
