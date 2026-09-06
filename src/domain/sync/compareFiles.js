export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}h`
  return `${(ms / 86400_000).toFixed(1)}d`
}

/**
 * Compares local and server save files, respecting character level progression
 * and protecting against corrupted or unparseable files.
 */
export function compareFiles(local, server) {
  if (!server) {
    return {
      action: 'push',
      direction: 'push',
      reason: 'New file on client',
      warnings: [],
    }
  }

  if (!local) {
    return {
      action: 'pull',
      direction: 'pull',
      reason: 'New file on host',
      warnings: [],
    }
  }

  if (local.hash === server.hash) {
    return {
      action: 'inSync',
      direction: 'none',
      reason: 'Identical file content',
      warnings: [],
    }
  }

  const warnings = []

  // Guard against 0-byte files overwriting valid saves
  if (local.sizeBytes === 0 && (server.sizeBytes || 0) > 0) {
    warnings.push('Client save file is 0 bytes. Aborting push to prevent data loss.')
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: 'Client file is 0 bytes',
      warnings,
    }
  }
  if (server.sizeBytes === 0 && (local.sizeBytes || 0) > 0) {
    warnings.push('Host save file is 0 bytes. Aborting pull to prevent data loss.')
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: 'Host file is 0 bytes',
      warnings,
    }
  }

  // Guard against a corrupted/unparseable save overwriting a valid save
  if (local.metadata?.error && server.metadata && !server.metadata.error) {
    warnings.push(`Client file parse error: ${local.metadata.error}. Aborting push to protect valid host save.`)
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: `Corrupted client save (${local.metadata.error})`,
      warnings,
    }
  }
  if (server.metadata?.error && local.metadata && !local.metadata.error) {
    warnings.push(`Host file parse error: ${server.metadata.error}. Aborting pull to protect valid client save.`)
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: `Corrupted host save (${server.metadata.error})`,
      warnings,
    }
  }

  if (local.metadata?.error) {
    warnings.push(`Client file parse error: ${local.metadata.error}`)
  }
  if (server.metadata?.error) {
    warnings.push(`Host file parse error: ${server.metadata.error}`)
  }

  const localTime = new Date(local.modifiedAt).getTime()
  const serverTime = new Date(server.modifiedAt).getTime()
  const diffMs = localTime - serverTime
  const absDiffStr = formatDuration(Math.abs(diffMs))

  const isD2S = (local.filename || server.filename || '').toLowerCase().endsWith('.d2s')
  const locMeta = local.metadata || {}
  const srvMeta = server.metadata || {}

  if (isD2S && typeof locMeta.level === 'number' && typeof srvMeta.level === 'number') {
    const locLvl = locMeta.level
    const srvLvl = srvMeta.level
    const locItems = locMeta.itemCount
    const srvItems = srvMeta.itemCount

    if (locLvl > srvLvl) {
      if (localTime >= serverTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
          warnings.push(`Client has fewer items (${locItems} vs ${srvItems}) despite higher level.`)
        }
        return {
          action: 'push',
          direction: 'push',
          reason: `Client character is higher level (Lvl ${locLvl} vs Lvl ${srvLvl}, +${absDiffStr})`,
          warnings,
        }
      } else {
        warnings.push('Level and timestamp conflict: host save is newer, but client character is higher level.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: `Host timestamp is newer (+${absDiffStr}) but client has higher level (Lvl ${locLvl} vs Lvl ${srvLvl})`,
          warnings,
        }
      }
    } else if (srvLvl > locLvl) {
      if (serverTime >= localTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
          warnings.push(`Host has fewer items (${srvItems} vs ${locItems}) despite higher level.`)
        }
        return {
          action: 'pull',
          direction: 'pull',
          reason: `Host character is higher level (Lvl ${srvLvl} vs Lvl ${locLvl}, +${absDiffStr})`,
          warnings,
        }
      } else {
        warnings.push('Level and timestamp conflict: client save is newer, but host character has higher level.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: `Client timestamp is newer (+${absDiffStr}) but host has higher level (Lvl ${srvLvl} vs Lvl ${locLvl})`,
          warnings,
        }
      }
    } else {
      // Same level
      if (localTime > serverTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
          warnings.push(`Client character has fewer items (${locItems} vs ${srvItems}).`)
        }
        return {
          action: 'push',
          direction: 'push',
          reason: `Client character is newer (+${absDiffStr}, Lvl ${locLvl})`,
          warnings,
        }
      } else if (serverTime > localTime) {
        if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
          warnings.push(`Host character has fewer items (${srvItems} vs ${locItems}).`)
        }
        return {
          action: 'pull',
          direction: 'pull',
          reason: `Host character is newer (+${absDiffStr}, Lvl ${srvLvl})`,
          warnings,
        }
      } else {
        warnings.push('Identical timestamps but different file contents.')
        return {
          action: 'conflict',
          direction: 'conflict',
          reason: 'Identical timestamps with differing content',
          warnings,
        }
      }
    }
  }

  // Shared stash (.d2i) or character without level metadata
  const locItems = locMeta.itemCount
  const srvItems = srvMeta.itemCount
  const locPages = locMeta.pageCount
  const srvPages = srvMeta.pageCount

  if (localTime > serverTime) {
    if (typeof locItems === 'number' && typeof srvItems === 'number' && locItems < srvItems) {
      warnings.push(`Client stash has fewer items (${locItems} vs ${srvItems}).`)
    }
    if (typeof locPages === 'number' && typeof srvPages === 'number' && locPages < srvPages) {
      warnings.push(`Client stash has fewer pages (${locPages} vs ${srvPages}).`)
    }
    const itemDesc = typeof locItems === 'number' ? `, ${locItems} items` : ''
    return {
      action: 'push',
      direction: 'push',
      reason: `Client file is newer (+${absDiffStr}${itemDesc})`,
      warnings,
    }
  } else if (serverTime > localTime) {
    if (typeof locItems === 'number' && typeof srvItems === 'number' && srvItems < locItems) {
      warnings.push(`Host stash has fewer items (${srvItems} vs ${locItems}).`)
    }
    if (typeof locPages === 'number' && typeof srvPages === 'number' && srvPages < locPages) {
      warnings.push(`Host stash has fewer pages (${srvPages} vs ${locPages}).`)
    }
    const itemDesc = typeof srvItems === 'number' ? `, ${srvItems} items` : ''
    return {
      action: 'pull',
      direction: 'pull',
      reason: `Host file is newer (+${absDiffStr}${itemDesc})`,
      warnings,
    }
  } else {
    warnings.push('Identical timestamps but different file contents.')
    return {
      action: 'conflict',
      direction: 'conflict',
      reason: 'Identical timestamps with differing content',
      warnings,
    }
  }
}
